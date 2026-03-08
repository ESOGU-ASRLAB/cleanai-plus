from typing import List, Optional, Tuple, Iterator
import asyncio
import time
import os
import sys
import pickle
import numpy as np
import importlib.util
from datetime import datetime
from beanie import PydanticObjectId
from app.models.workspace.execution import Execution, ExecutionStatus
from app.models.workspace.workspace import Workspace
from app.models.auth.user import UserInDB
from app.models.dataset.dataset import Dataset
from app.models.workspace.preprocessing import Preprocessing
from app.services.report_service import ReportService
from app.services.email_service import send_execution_result_email
from app.models.ai_model import ModelFormat
from app.schemas.execution import ExecutionCreate
from app.database.mongodb import get_database

from sklearn.metrics import precision_recall_fscore_support, accuracy_score, confusion_matrix as sk_confusion_matrix
from typing import Dict

# In-memory progress tracking: execution_id -> progress percentage (0-100)
# Updated by the sync inference thread; read by the /progress endpoint.
_execution_progress: Dict[str, int] = {}

# Set of execution_ids that have been requested to cancel.
# Checked inside the sync inference thread each batch.
_execution_cancelled: set = set()

# Energy & Compute Consumption Tracking
try:
    from codecarbon import EmissionsTracker, OfflineEmissionsTracker
except ImportError:
    EmissionsTracker = None

# THOP Import (FLOPs counting)
try:
    import thop
except ImportError:
    thop = None

# PyTorch Imports (Delayed to avoid startup overhead if not used, but good for type check)
import torch
import torch.nn as nn
from torchvision import transforms
from PIL import Image

class ONNXModelWrapper(nn.Module):
    def __init__(self, path: str, device: torch.device):
        super().__init__()
        try:
            import onnxruntime as ort
        except ImportError:
            raise ImportError("onnxruntime is required to load ONNX models. Please install it.")

        providers = ['CPUExecutionProvider']
        if device.type == 'cuda':
             providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
             
        try:
            self.session = ort.InferenceSession(path, providers=providers)
        except Exception as e:
            # Fallback to CPU if CUDA provider fails or other issues
            print(f"Failed to create ONNX session with requested providers {providers}: {e}. Falling back to CPU.")
            self.session = ort.InferenceSession(path, providers=['CPUExecutionProvider'])

        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name
        self.device = device

    def forward(self, x):
        # x is torch tensor. Convert to numpy.
        # Ensure x is on CPU and numpy-compatible
        x_np = x.cpu().detach().numpy()
        
        # ONNX Runtime expects input as dict
        inputs = {self.input_name: x_np}
        
        # Run inference
        outputs = self.session.run([self.output_name], inputs)
        
        # Convert back to torch tensor
        return torch.from_numpy(outputs[0]).to(self.device)

class ExecutionService:
    async def create_execution(self, workspace_id: str, request: ExecutionCreate) -> Execution:
        execution = Execution(
            workspace_id=PydanticObjectId(workspace_id),
            model_id=PydanticObjectId(request.model_id),
            dataset_id=PydanticObjectId(request.dataset_id),
            preprocessing_id=PydanticObjectId(request.preprocessing_id) if request.preprocessing_id else None,
            config=request.config
        )
        await execution.insert()
        return execution
    
    async def run_execution(self, execution_id: str):
        """
        Runs the actual inference pipeline using PyTorch.
        The CPU-heavy inference work is offloaded to a thread pool via
        run_in_executor so the asyncio event loop is never blocked.
        """
        execution = await self.get_execution(execution_id)
        if not execution:
            print(f"Execution {execution_id} not found.")
            return

        try:
            # 1. Update Status to RUNNING
            execution.status = ExecutionStatus.RUNNING
            execution.started_at = datetime.utcnow()
            await execution.save()

            # 2. Fetch Resources (async DB ops)
            db = await get_database()
            model_doc = await db.ai_models.find_one({"_id": execution.model_id})
            dataset_doc = await Dataset.get(execution.dataset_id)

            preprocessing_doc = None
            if execution.preprocessing_id:
                preprocessing_doc = await Preprocessing.get(execution.preprocessing_id)

            if not model_doc:
                raise Exception("Model not found")
            if not dataset_doc:
                raise Exception("Dataset not found")

            # 3. Offload CPU-heavy inference to a thread pool executor
            #    so the event loop stays free to handle other requests.
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(
                None,
                self._run_inference_sync,
                model_doc,
                dataset_doc,
                preprocessing_doc,
                execution.config,
                execution_id,
            )

            # 4. Persist results
            execution.status = ExecutionStatus.COMPLETED
            execution.completed_at = datetime.utcnow()
            execution.metrics = result["metrics"]
            await execution.save()
            _execution_progress.pop(execution_id, None)
            _execution_cancelled.discard(execution_id)
            print(f"Execution {execution_id} completed. Acc: {result['accuracy']:.2f}, F1: {result['f1']:.2f}")

            # 5. Log activity
            try:
                from app.services.activity_service import ActivityService
                workspace_doc = await db.workspaces.find_one({"_id": execution.workspace_id})
                if workspace_doc:
                    activity_svc = ActivityService(db)
                    await activity_svc.log_activity(
                        workspace_id=str(execution.workspace_id),
                        user_id=str(workspace_doc["owner_id"]),
                        action="execution_completed",
                        details={
                            "execution_id": execution_id,
                            "model_name": model_doc.get("name", "Unknown"),
                            "dataset_name": dataset_doc.name if dataset_doc else "Unknown",
                            "accuracy": round(float(result["accuracy"]), 4),
                            "f1_score": round(float(result["f1"]), 4),
                        },
                    )
            except Exception as log_err:
                print(f"Failed to log execution_completed activity: {log_err}")

            # 6. Generate Report
            pdf_path = None
            try:
                report_service = ReportService()
                preprocessing_name = "None (Raw Data)"
                preprocessing_steps = []
                preprocessing_code = None
                if preprocessing_doc:
                    preprocessing_name = preprocessing_doc.name
                    if preprocessing_doc.mode == "ui" and preprocessing_doc.steps:
                        for idx, step in enumerate(preprocessing_doc.steps, 1):
                            s_type = step.get("type", "Unknown")
                            params = step.get("params", {})
                            param_str = ", ".join([f"{k}={v}" for k, v in params.items()])
                            preprocessing_steps.append(f"{idx}. {s_type} ({param_str})")
                    elif preprocessing_doc.mode == "code":
                        preprocessing_code = preprocessing_doc.code

                report = await report_service.generate_execution_report(
                    execution=execution,
                    model_name=model_doc["name"],
                    dataset_name=dataset_doc.name,
                    preprocessing_name=preprocessing_name,
                    preprocessing_steps=preprocessing_steps,
                    preprocessing_code=preprocessing_code,
                )
                pdf_path = report.file_path
                print(f"Report generated for execution {execution_id}")
            except Exception as report_err:
                print(f"Failed to generate report: {report_err}")

            # 7. Send Success Email
            try:
                db = await get_database()
                workspace = await db.workspaces.find_one({"_id": execution.workspace_id})
                if workspace:
                    user = await db.users.find_one({"_id": workspace["owner_id"]})
                    if user and user.get("email"):
                        settings = await db.notification_settings.find_one({"user_id": user["_id"]})
                        send_email = True
                        if settings and not settings.get("execution_success", True):
                            send_email = False
                        if send_email:
                            success, html_content, attachment_base64 = send_execution_result_email(
                                to_email=user["email"],
                                full_name=user.get("full_name", "User"),
                                execution_id=str(execution.id),
                                workspace_id=str(workspace["_id"]),
                                status="completed",
                                metrics=execution.metrics,
                                pdf_path=pdf_path,
                            )
                            await db.email_logs.insert_one({
                                "user_id": user["_id"],
                                "to_email": user["email"],
                                "subject": f"CleanAI+ - Execution Completed Successfully ({str(execution.id)[:8]})",
                                "status": "sent" if success else "failed",
                                "email_type": "execution_success",
                                "content_html": html_content,
                                "attachment_base64": attachment_base64,
                                "error_message": None if success else "SMTP Error",
                                "sent_at": datetime.utcnow(),
                            })
                            if success:
                                print(f"Success email sent to {user['email']}")
                            else:
                                print(f"Failed to send success email to {user['email']}")
                        else:
                            print(f"Success email skipped for {user['email']} due to notification settings.")
            except Exception as email_err:
                print(f"Failed to process success email: {email_err}")

        except Exception as e:
            print(f"Execution failed: {str(e)}")
            if isinstance(e, InterruptedError):
                execution.status = ExecutionStatus.CANCELLED
                execution.error_message = "Cancelled by user."
            else:
                execution.status = ExecutionStatus.FAILED
                execution.error_message = str(e)
            execution.completed_at = datetime.utcnow()
            await execution.save()
            _execution_progress.pop(execution_id, None)
            _execution_cancelled.discard(execution_id)

            # No failure email for user-initiated cancellations
            if isinstance(e, InterruptedError):
                return

            # Send Failure Email
            try:
                db = await get_database()
                workspace = await db.workspaces.find_one({"_id": execution.workspace_id})
                if workspace:
                    user = await db.users.find_one({"_id": workspace["owner_id"]})
                    if user and user.get("email"):
                        settings = await db.notification_settings.find_one({"user_id": user["_id"]})
                        send_email = True
                        if settings and not settings.get("execution_failure", True):
                            send_email = False
                        if send_email:
                            success, html_content, attachment_base64 = send_execution_result_email(
                                to_email=user["email"],
                                full_name=user.get("full_name", "User"),
                                execution_id=str(execution.id),
                                workspace_id=str(workspace["_id"]),
                                status="failed",
                                error_message=str(e),
                            )
                            await db.email_logs.insert_one({
                                "user_id": user["_id"],
                                "to_email": user["email"],
                                "subject": f"CleanAI+ - Execution Failed ({str(execution.id)[:8]})",
                                "status": "sent" if success else "failed",
                                "email_type": "execution_failure",
                                "content_html": html_content,
                                "attachment_base64": attachment_base64,
                                "error_message": None if success else "SMTP Error",
                                "sent_at": datetime.utcnow(),
                            })
                            if success:
                                print(f"Failure email sent to {user['email']}")
                            else:
                                print(f"Failed to send failure email to {user['email']}")
                        else:
                            print(f"Failure email skipped for {user['email']} due to notification settings.")
            except Exception as email_err:
                print(f"Failed to process failure email: {email_err}")

    def _run_inference_sync(self, model_doc, dataset_doc, preprocessing_doc, config, execution_id: str) -> dict:
        """
        Synchronous inference pipeline — runs in a thread pool executor.
        Returns {"metrics": dict, "accuracy": float, "f1": float}.
        """
        import torch.nn as nn

        # Device
        device = torch.device(config.get("device", "cpu"))
        if config.get("device") == "cuda" and not torch.cuda.is_available():
            print("CUDA not available, falling back to CPU")
            device = torch.device("cpu")

        print(f"Loading model {model_doc['name']} on {device}")

        model_classes = sorted(dataset_doc.classes) if dataset_doc.classes else []
        num_classes = len(model_classes) if model_classes else 10

        model = self._load_model_from_disk(model_doc, device, num_classes)
        model.eval()

        if device.type == "cuda":
            torch.backends.cudnn.benchmark = True

        preprocess = self._build_transforms(preprocessing_doc)
        class_to_idx = {cls_name: i for i, cls_name in enumerate(model_classes)}
        limit = config.get("limit_samples", 0)

        print(f"Dataset Classes in DB: {dataset_doc.classes}")
        print(f"Computed Class to Index Map: {class_to_idx}")

        label_map = {}
        if dataset_doc.schema_info and "label_map" in dataset_doc.schema_info:
            label_map = dataset_doc.schema_info["label_map"]
            print(f"Using explicit label map from dataset schema: {label_map}")

        shuffle_dataset = bool(config.get("shuffle_dataset", True))
        dataset_iterator = self._get_samples_iterator(dataset_doc, limit, shuffle=shuffle_dataset)

        # Total samples estimate for progress tracking
        total_samples = limit if limit > 0 else (getattr(dataset_doc, "file_count", None) or 0)
        _execution_progress[execution_id] = 0

        correct = 0
        total = 0
        loss_sum = 0.0
        criterion = nn.CrossEntropyLoss()
        processed_count = 0
        error_count = 0
        flops_per_sample = 0

        all_targets = []
        all_preds = []
        all_probs = []

        batch_size = int(config.get("batch_size", 32))
        batch_tensors = []
        batch_label_names = []
        batch_sample_ids = []

        # CodeCarbon tracker
        tracker = None
        if EmissionsTracker:
            try:
                tracker = EmissionsTracker(
                    project_name=f"exec_{execution_id}",
                    measure_power_secs=1,
                    log_level="error",
                    save_to_file=False,
                )
                tracker.start()
            except Exception as e:
                print(f"CodeCarbon Warning: {e}")
                tracker = None
        else:
            print("CodeCarbon not installed. Energy metrics will be unavailable.")

        start_time = time.perf_counter()

        def flush_batch():
            nonlocal correct, total, loss_sum, flops_per_sample, processed_count

            if not batch_tensors:
                return

            input_batch = torch.stack(batch_tensors).to(device)

            if processed_count == 0 and thop and model:
                try:
                    macs, _ = thop.profile(model, inputs=(input_batch[:1],), verbose=False)
                    flops_per_sample = macs * 2
                except Exception as thop_e:
                    print(f"THOP Warning: {thop_e}")

            outputs = model(input_batch)
            probs_batch = torch.nn.functional.softmax(outputs, dim=1)
            _, predicted_batch = torch.max(outputs, 1)

            for i, (lname, sid) in enumerate(zip(batch_label_names, batch_sample_ids)):
                if processed_count < 3:
                    print(f"Sample: {sid}, Extracted Label: '{lname}'")

                target_idx = -1
                if lname in label_map:
                    try:
                        target_idx = int(label_map[lname])
                    except ValueError:
                        print(f"Invalid index in label_map for {lname}: {label_map[lname]}")
                elif lname and lname in class_to_idx:
                    target_idx = class_to_idx[lname]

                if target_idx >= 0:
                    num_outputs = outputs.shape[1]
                    if target_idx < num_outputs:
                        target = torch.tensor([target_idx]).to(device)
                        loss = criterion(outputs[i : i + 1], target)
                        loss_sum += loss.item()
                        if predicted_batch[i].item() == target_idx:
                            correct += 1
                        all_targets.append(target_idx)
                        all_preds.append(predicted_batch[i].item())
                        all_probs.append(probs_batch[i].cpu().numpy())
                    else:
                        if processed_count < 5:
                            print(
                                f"Warning: Label '{lname}' (idx {target_idx}) out of bounds "
                                f"for model output size {num_outputs}. Skipping."
                            )

                total += 1
                processed_count += 1

            # Update in-memory progress after each batch
            if total_samples > 0:
                _execution_progress[execution_id] = min(99, int(processed_count / total_samples * 100))

            batch_tensors.clear()
            batch_label_names.clear()
            batch_sample_ids.clear()

        with torch.no_grad():
            for sample_id, image, label_name in dataset_iterator:
                if execution_id in _execution_cancelled:
                    raise InterruptedError("Execution cancelled by user.")
                try:
                    if image.mode != "RGB":
                        image = image.convert("RGB")
                    tensor = preprocess(image)
                    batch_tensors.append(tensor)
                    batch_label_names.append(label_name)
                    batch_sample_ids.append(sample_id)
                    if len(batch_tensors) >= batch_size:
                        flush_batch()
                except Exception as img_err:
                    err_str = str(img_err)
                    if "Output size is too small" in err_str:
                        raise Exception(
                            f"Input image too small for model architecture. Please add a 'Resize' step "
                            f"(e.g., 224x224) to your Preprocessing configuration. PyTorch Error: {err_str}"
                        )
                    print(f"Error processing sample {sample_id}: {img_err}")
                    error_count += 1
                    if error_count > 10:
                        raise Exception(f"Aborting execution: Too many errors ({error_count}). Last error: {err_str}")
            flush_batch()

        end_time = time.perf_counter()
        total_time_sec = end_time - start_time

        total_energy_kwh = 0.0
        emissions_kg = 0.0
        if tracker:
            try:
                emissions_kg = tracker.stop() or 0.0
                if hasattr(tracker, "final_emissions_data") and tracker.final_emissions_data:
                    total_energy_kwh = tracker.final_emissions_data.energy_consumed
            except Exception as e:
                print(f"Error stopping CodeCarbon tracker: {e}")

        total_energy_j = total_energy_kwh * 3_600_000

        print(f"Processed {total} samples.")

        accuracy = correct / len(all_targets) if len(all_targets) > 0 else 0.0
        avg_loss = loss_sum / len(all_targets) if len(all_targets) > 0 else 0.0

        precision, recall, f1, _ = precision_recall_fscore_support(
            all_targets, all_preds, average="weighted", zero_division=0
        )

        top5_acc = 0.0
        topk_accuracies = {}   # k -> accuracy
        if len(all_targets) > 0 and len(all_probs) > 0:
            n_classes = len(all_probs[0]) if len(all_probs) > 0 else 0
            for k in range(1, 6):
                effective_k = min(k, n_classes) if n_classes > 0 else k
                k_correct = 0
                for i, target in enumerate(all_targets):
                    probs = all_probs[i]
                    top_k_indices = probs.argsort()[-effective_k:][::-1]
                    if target in top_k_indices:
                        k_correct += 1
                topk_accuracies[k] = round(k_correct / len(all_targets), 4)
            top5_acc = topk_accuracies.get(5, 0.0)

        real_total_size = (
            dataset_doc.file_count
            if dataset_doc.file_count and dataset_doc.file_count > 0
            else total
        )
        inf_time_ms = (total_time_sec / total * 1000) if total > 0 else 0
        energy_per_sample_j = (total_energy_j / total) if total > 0 else 0
        gflops = flops_per_sample / 1e9
        gflops_per_joule = (gflops * total / total_energy_j) if total_energy_j > 0 else 0
        emissions_g = float(emissions_kg) * 1000
        total_time_min = total_time_sec / 60
        emissions_per_minute_g = (emissions_g / total_time_min) if total_time_min > 0 else 0

        def fmt(val):
            return "{:.2f}".format(val)

        metrics = {
            "accuracy": round(accuracy, 4),
            "top5_accuracy": round(top5_acc, 4),
            "loss": round(avg_loss, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
            "processed_samples": total,
            "dataset_size": real_total_size,
            "total_time_s": fmt(total_time_sec),
            "time_per_sample_ms": fmt(inf_time_ms),
            "total_energy_j": fmt(total_energy_j),
            "energy_per_sample_j": fmt(energy_per_sample_j),
            "gflops_per_sample": fmt(gflops),
            "gflops_per_joule": fmt(gflops_per_joule),
            "emissions": round(emissions_g, 6),
            "emissions_per_min": round(emissions_per_minute_g, 6),
        }

        if topk_accuracies:
            metrics["topk_accuracies"] = topk_accuracies

        # Confusion matrix
        if len(all_targets) > 0 and len(all_preds) > 0:
            # Use all model classes when count is manageable (≤100) so the matrix
            # always reflects the true NxN shape (e.g. 10×10 for CIFAR-10 even if
            # some classes were not sampled). For larger class sets fall back to
            # only the classes that actually appeared to keep storage reasonable.
            if len(model_classes) <= 100:
                present_labels = list(range(len(model_classes)))
                cm_class_names = list(model_classes)
            else:
                present_labels = sorted(set(all_targets) | set(all_preds))
                cm_class_names = [
                    model_classes[i] if i < len(model_classes) else str(i)
                    for i in present_labels
                ]
            cm = sk_confusion_matrix(all_targets, all_preds, labels=present_labels)
            metrics["confusion_matrix"] = cm.tolist()
            metrics["confusion_matrix_labels"] = cm_class_names

            # Per-class accuracy from confusion matrix diagonal
            per_class_acc = []
            for idx, row in enumerate(cm.tolist()):
                row_sum = sum(row)
                if row_sum > 0:
                    acc = round(row[idx] / row_sum, 4)
                    per_class_acc.append({"label": cm_class_names[idx], "accuracy": acc})

            if per_class_acc:
                sorted_acc = sorted(per_class_acc, key=lambda x: x["accuracy"], reverse=True)
                n_cls = len(sorted_acc)
                top7 = sorted_acc[:min(7, n_cls)]
                top7_labels = {x["label"] for x in top7}
                bottom_candidates = list(reversed(sorted_acc[-min(3, n_cls):]))
                bottom3 = [x for x in bottom_candidates if x["label"] not in top7_labels]
                if not bottom3:  # fewer than 10 classes — no non-overlapping bottom
                    bottom3 = bottom_candidates
                metrics["class_accuracy_top3"]    = top7
                metrics["class_accuracy_bottom3"] = bottom3

        return {"metrics": metrics, "accuracy": accuracy, "f1": float(f1)}

    def _build_transforms(self, preprocessing_doc: Optional[Preprocessing]) -> transforms.Compose:
        """
        Builds the transforms.Compose object based on the preprocessing definition.
        """
        if not preprocessing_doc or (not preprocessing_doc.steps and not preprocessing_doc.code):
             return transforms.Compose([
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
            ])
        
        # Handle Code Mode
        if preprocessing_doc.mode == "code" and preprocessing_doc.code:
            try:
                # Prepare execution context
                scope = {
                    "torch": torch,
                    "transforms": transforms,
                    "Image": Image,
                    "np": np
                }
                
                # Execute the code string
                exec(preprocessing_doc.code, scope)
                
                # Retrieve get_transform function
                if "get_transform" in scope:
                    return scope["get_transform"]()
                else:
                    raise ValueError("Function 'get_transform' not found in custom code.")
            except Exception as e:
                print(f"Error executing custom preprocessing code: {e}")
                raise e

        transform_list = []
        
        # Handle UI steps
        if preprocessing_doc.mode == "ui" and preprocessing_doc.steps:
            for step in preprocessing_doc.steps:
                s_type = step.get("type")
                params = step.get("params", {})
                
                try:
                    if s_type == "Resize":
                        h = int(params.get("height", 224))
                        w = int(params.get("width", 224))
                        transform_list.append(transforms.Resize((h, w)))
                    elif s_type == "CenterCrop":
                        h = int(params.get("height", 224))
                        w = int(params.get("width", 224))
                        transform_list.append(transforms.CenterCrop((h, w)))
                    elif s_type == "Grayscale":
                        transform_list.append(transforms.Grayscale(num_output_channels=int(params.get("num_output_channels", 3))))
                    elif s_type == "ToTensor":
                        transform_list.append(transforms.ToTensor())
                    elif s_type == "Normalize":
                        mean = params.get("mean", [0.485, 0.456, 0.406])
                        std = params.get("std", [0.229, 0.224, 0.225])
                        transform_list.append(transforms.Normalize(mean=mean, std=std))
                except Exception as e:
                    print(f"Error building transform step {s_type}: {e}")
        
        # Check if ToTensor exists. If not, we must add it before Normalize or at the end.
        has_to_tensor = any(isinstance(t, transforms.ToTensor) for t in transform_list)
        if not has_to_tensor:
             # Find Normalize index
             norm_indices = [i for i, t in enumerate(transform_list) if isinstance(t, transforms.Normalize)]
             if norm_indices:
                 transform_list.insert(norm_indices[0], transforms.ToTensor())
             else:
                 transform_list.append(transforms.ToTensor())
                 
        return transforms.Compose(transform_list)

    def _get_samples_iterator(self, dataset_doc: Dataset, limit: int = 0, shuffle: bool = True) -> Iterator[Tuple[str, Image.Image, str]]:
        """
        Yields (id, image_pil, label_name) from either direct image files or pickle batches.
        When shuffle=True, samples are randomly ordered before iterating.
        """
        import random
        dataset_root = dataset_doc.path
        valid_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}

        # Strategy 1: Collect all image file paths, then optionally shuffle
        file_samples = []  # list of (full_path, rel_path, label_name)
        for root, dirs, files in os.walk(dataset_root):
            for file in files:
                if os.path.splitext(file)[1].lower() in valid_extensions:
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, dataset_root)
                    label_name = rel_path.split("/")[0].split("\\")[0]  # Infer from folder
                    file_samples.append((full_path, rel_path, label_name))

        if file_samples:
            if shuffle:
                random.shuffle(file_samples)
            if limit > 0:
                file_samples = file_samples[:limit]
            for full_path, rel_path, label_name in file_samples:
                try:
                    img = Image.open(full_path)
                    img.load()  # Force load
                    yield rel_path, img, label_name
                except Exception as e:
                    print(f"Skipping bad image {rel_path}: {e}")
            return

        # Strategy 2: If no images found, look for pickle/batch files
        print("No images found on disk, checking for pickle batches...")

        # Load metadata for labels if available
        label_map = {}
        for root, dirs, files in os.walk(dataset_root):
            for file in files:
                if 'meta' in file.lower():
                    try:
                        with open(os.path.join(root, file), 'rb') as f:
                            data = pickle.load(f, encoding='bytes')
                            if b'label_names' in data:
                                label_names = [x.decode('utf-8') for x in data[b'label_names']]
                                for idx, name in enumerate(label_names):
                                    label_map[idx] = name
                    except: pass

        # Collect all pickle samples first (they are numpy arrays, already in memory)
        all_pickle_samples = []  # list of (sample_id, img_data_ndarray, label_idx)
        for root, dirs, files in os.walk(dataset_root):
            for file in files:
                fname = file.lower()
                if 'meta' in fname or fname.endswith('.html') or fname.endswith('.txt'):
                    continue
                path = os.path.join(root, file)
                try:
                    with open(path, 'rb') as f:
                        batch = pickle.load(f, encoding='bytes')
                    if not isinstance(batch, dict):
                        continue
                    keys = list(batch.keys())

                    def find_key(candidates):
                        for k in keys:
                            if isinstance(k, bytes):
                                if k in [c.encode('utf-8') for c in candidates]: return k
                            elif isinstance(k, str):
                                if k in candidates: return k
                        return None

                    data_key = find_key(['data', 'features'])
                    labels_key = find_key(['labels', 'fine_labels'])
                    if data_key and labels_key:
                        features = batch[data_key]
                        labels = batch[labels_key]
                        # Reshape Logic (Same as DatasetService)
                        if len(features.shape) == 2:
                            N = len(features)
                            D = features.shape[1]
                            if D == 3072:   # CIFAR
                                features = features.reshape((N, 3, 32, 32)).transpose(0, 2, 3, 1)
                            elif D == 784:  # MNIST
                                features = features.reshape((N, 28, 28))
                        for i in range(len(features)):
                            all_pickle_samples.append((f"{file}_{i}", features[i], labels[i]))
                except Exception:
                    continue

        if all_pickle_samples:
            if shuffle:
                random.shuffle(all_pickle_samples)
            if limit > 0:
                all_pickle_samples = all_pickle_samples[:limit]
            for sample_id, img_data, label_idx in all_pickle_samples:
                if img_data.dtype != np.uint8:
                    img_data = img_data.astype(np.uint8)
                img = Image.fromarray(img_data)
                label_name = label_map.get(label_idx, str(label_idx))
                yield sample_id, img, label_name

    def _load_model_from_disk(self, model_doc: dict, device: torch.device, num_classes: int = 10) -> nn.Module:
        """
        Loads the model from disk based on format and definition.
        """
        file_path = model_doc["file_path"]
        fmt = model_doc["format"]
        
        # 1. Load Definition if State Dict
        model_class = None
        if fmt == ModelFormat.STATE_DICT:
            def_path = model_doc.get("definition_file_path")
            if not def_path or not os.path.exists(def_path):

                 # Or fail.
                 # For safety, let's try to load standard ResNet18 if file not found but user intent is clear?
                 # ideally, user MUST provide definition.
                 # Let's try loading the definition file dynamically.
                 pass
            
            if def_path:
                spec = importlib.util.spec_from_file_location("model_def", def_path)
                module = importlib.util.module_from_spec(spec)
                sys.modules["model_def"] = module
                spec.loader.exec_module(module)
                
                # Assume the first class inheriting from nn.Module is the one
                for name, obj in module.__dict__.items():
                    if isinstance(obj, type) and issubclass(obj, nn.Module) and obj is not nn.Module:
                        model_class = obj
                        break
                
                if not model_class:
                    raise Exception("No nn.Module class found in definition file.")
                
                model = model_class()
            else:
                # FAST FALLBACK for Demo: If no definition, try ResNet18 structure
                import torchvision.models as models
                model = models.resnet18() 
                # Adjust fc for CIFAR (10 classes) usually if it was trained on CIFAR
                # But if it's standard ResNet18 state dict, it depends.
                # We'll assume the user provided state dict matches this architecture.
                # If shapes mismatch, torch will raise error.
                # Check output features
                try:
                    # Heuristic: Check state dict size to determining FC layer?
                    # Too complex. Let's just create standard resnet.
                    model.fc = nn.Linear(model.fc.in_features, num_classes) # Use dataset classes count
                except:
                    pass

            # Load Weights
            state_dict = torch.load(file_path, map_location=device, weights_only=False)
            model.load_state_dict(state_dict)
            model.to(device)
            return model

        elif fmt == ModelFormat.FULL_MODEL:
            model = torch.load(file_path, map_location=device, weights_only=False)
            model.eval()
            return model

        elif fmt == ModelFormat.TORCHSCRIPT:
            model = torch.jit.load(file_path, map_location=device)
            model.eval()
            return model
            
        elif fmt == ModelFormat.SAFETENSORS:
            from safetensors.torch import load_file
            
            # Safetensors usually requires a model definition just like state_dict
            # We'll reuse the logic from STATE_DICT for model instantiation (simplified here for brevity, assume definition needed)
            # In a real app, refactor model instantiation into a helper.
            
            # For now, duplicate definition loading for simplicity
            def_path = model_doc.get("definition_file_path")
            if def_path and os.path.exists(def_path):
                 spec = importlib.util.spec_from_file_location("model_def_st", def_path)
                 module = importlib.util.module_from_spec(spec)
                 sys.modules["model_def_st"] = module
                 spec.loader.exec_module(module)
                 for name, obj in module.__dict__.items():
                     if isinstance(obj, type) and issubclass(obj, nn.Module) and obj is not nn.Module:
                         model_class = obj
                         break
            
            if not model_class:
                 # Fallback similar to state_dict
                 import torchvision.models as models
                 model = models.resnet18()
                 try: model.fc = nn.Linear(model.fc.in_features, num_classes)
                 except: pass
            else:
                 model = model_class()
            
            state_dict = load_file(file_path) # Safetensors load
            model.load_state_dict(state_dict)
            model.to(device)
            return model
        
        elif fmt == ModelFormat.ONNX:
            model = ONNXModelWrapper(file_path, device)
            model.eval()
            return model
            
        else:
             raise Exception(f"Model format {fmt} not supported yet in this runner.")


    async def get_executions(self, workspace_id: str) -> List[Execution]:
        return await Execution.find(Execution.workspace_id == PydanticObjectId(workspace_id)).sort(-Execution.created_at).to_list()

    async def get_execution(self, execution_id: str) -> Optional[Execution]:
        return await Execution.get(PydanticObjectId(execution_id))

    def get_progress(self, execution_id: str) -> int:
        """Return current progress (0-100) for a running execution."""
        return _execution_progress.get(execution_id, 0)

    async def cancel_execution(self, execution_id: str) -> bool:
        """Signal the running inference thread to stop at the next batch boundary.
        If no active thread is found (e.g. after a server restart), forcibly marks
        the execution as CANCELLED in the DB immediately."""
        execution = await self.get_execution(execution_id)
        if not execution:
            return False
        if execution.status not in (ExecutionStatus.PENDING, ExecutionStatus.RUNNING):
            return False

        _execution_cancelled.add(execution_id)

        # For PENDING or RUNNING executions that have no live thread
        # (server restart, orphaned state), cancel immediately in the DB.
        no_active_thread = execution_id not in _execution_progress
        if execution.status == ExecutionStatus.PENDING or no_active_thread:
            execution.status = ExecutionStatus.CANCELLED
            execution.error_message = "Cancelled by user."
            execution.completed_at = datetime.utcnow()
            await execution.save()
            _execution_progress.pop(execution_id, None)
            _execution_cancelled.discard(execution_id)
        return True
