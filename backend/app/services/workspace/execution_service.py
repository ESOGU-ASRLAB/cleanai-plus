from typing import List, Optional, Tuple, Iterator
import asyncio
import os
import sys
import pickle
import numpy as np
import importlib.util
from datetime import datetime
from beanie import PydanticObjectId
from app.models.workspace.execution import Execution, ExecutionStatus
from app.models.dataset.dataset import Dataset
from app.models.workspace.preprocessing import Preprocessing
from app.services.report_service import ReportService
from app.models.ai_model import ModelFormat
from app.schemas.execution import ExecutionCreate
from app.database.mongodb import get_database

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

            # 2. Fetch Resources
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

            # 3. Load Model
            device = torch.device(execution.config.get("device", "cpu"))
            if execution.config.get("device") == "cuda" and not torch.cuda.is_available():
                print("CUDA not available, falling back to CPU")
                device = torch.device("cpu")
            
            print(f"Loading model {model_doc['name']} on {device}")
            
            # Determine num_classes
            num_classes = len(dataset_doc.classes) if dataset_doc.classes else 10
            
            model = self._load_model_from_disk(model_doc, device, num_classes)
            model.eval()

            # 4. Prepare Data Loader & Inference Loop
            dataset_root = dataset_doc.path

            # Use Preprocessing if defined
            preprocess = self._build_transforms(preprocessing_doc)
            
            correct = 0
            total = 0
            loss_sum = 0.0
            criterion = nn.CrossEntropyLoss()
            
            # Map class names to indices if available
            class_to_idx = {cls_name: i for i, cls_name in enumerate(dataset_doc.classes or [])}
            
            # Limit samples if requested in config for quick test
            limit = execution.config.get("limit_samples", 0)
            
            print(f"Starting inference...")
            
            dataset_iterator = self._get_samples_iterator(dataset_doc, limit)
            processed_count = 0
            error_count = 0
            
            with torch.no_grad():
                for sample_id, image, label_name in dataset_iterator:
                    try:
                        # Prepare Input
                        if image.mode != 'RGB':
                            image = image.convert('RGB')
                        
                        input_tensor = preprocess(image).unsqueeze(0).to(device)
                        
                        # Inference
                        outputs = model(input_tensor)
                        
                        # Get Prediction
                        _, predicted = torch.max(outputs, 1)
                        
                        # Calculate Metrics if label is known
                        # If came from pickle, label_name might be actual name
                        
                        if label_name and label_name in class_to_idx:
                            label_idx = class_to_idx[label_name]
                            num_outputs = outputs.shape[1]
                            
                            if label_idx < num_outputs:
                                target = torch.tensor([label_idx]).to(device)
                                loss = criterion(outputs, target)
                                loss_sum += loss.item()
                                
                                if predicted.item() == target.item():
                                    correct += 1
                            else:
                                # Log warning for mismatches to avoid CUDA device-side assert errors
                                if processed_count < 5: 
                                    print(f"Warning: Label '{label_name}' (idx {label_idx}) is out of bounds for model output size {num_outputs}. Skipping loss calculation.")
                        
                        total += 1
                        processed_count += 1
                        
                    except Exception as img_err:
                        err_str = str(img_err)
                        # Check for specific "Output size is too small" error which causes spam
                        if "Output size is too small" in err_str:
                             raise Exception(f"Input image too small for model architecture. Please add a 'Resize' step (e.g., 224x224) to your Preprocessing configuration. PyTorch Error: {err_str}")

                        print(f"Error processing sample {sample_id}: {img_err}")
                        error_count += 1
                        if error_count > 10:
                            raise Exception(f"Aborting execution: Too many errors ({error_count}). Last error: {err_str}")
            
            print(f"Processed {total} samples.")

            # 5. Calculate Final Metrics
            accuracy = correct / total if total > 0 else 0.0
            avg_loss = loss_sum / total if total > 0 else 0.0

            # 6. Update Status to COMPLETED
            execution.status = ExecutionStatus.COMPLETED
            execution.completed_at = datetime.utcnow()
            execution.metrics = {
                "accuracy": round(accuracy, 4),
                "loss": round(avg_loss, 4),
                "processed_samples": total,
                "dataset_size": total # approximate
            }
            await execution.save()
            print(f"Execution {execution_id} completed. Acc: {accuracy:.2f}")

            # 7. Generate Report
            try:
                report_service = ReportService()
                
                # Fetch Preprocessing Name and Steps
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

                await report_service.generate_execution_report(
                    execution=execution,
                    model_name=model_doc["name"],
                    dataset_name=dataset_doc.name,
                    preprocessing_name=preprocessing_name,
                    preprocessing_steps=preprocessing_steps,
                    preprocessing_code=preprocessing_code
                )
                print(f"Report generated for execution {execution_id}")
            except Exception as report_err:
                print(f"Failed to generate report: {report_err}")

        except Exception as e:
            print(f"Execution failed: {str(e)}")
            execution.status = ExecutionStatus.FAILED
            execution.error_message = str(e)
            execution.completed_at = datetime.utcnow()
            await execution.save()

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

    def _get_samples_iterator(self, dataset_doc: Dataset, limit: int = 0) -> Iterator[Tuple[str, Image.Image, str]]:
        """
        Yields (id, image_pil, label_name) from either direct image files or pickle batches.
        """
        dataset_root = dataset_doc.path
        count = 0
        
        # Strategy 1: Look for images on disk
        valid_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
        has_images = False
        
        for root, dirs, files in os.walk(dataset_root):
            for file in files:
                if os.path.splitext(file)[1].lower() in valid_extensions:
                    has_images = True
                    if limit > 0 and count >= limit:
                        return

                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, dataset_root)
                    label_name = rel_path.split("/")[0].split("\\")[0] # Infer from folder
                    
                    try:
                        img = Image.open(full_path)
                        img.load() # Force load
                        yield rel_path, img, label_name
                        count += 1
                    except Exception as e:
                        print(f"Skipping bad image {rel_path}: {e}")
        
        if has_images:
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
                            # Handle CIFAR-10 specific meta
                            if b'label_names' in data:
                                label_names = [x.decode('utf-8') for x in data[b'label_names']]
                                for idx, name in enumerate(label_names):
                                    label_map[idx] = name
                    except: pass

        for root, dirs, files in os.walk(dataset_root):
             for file in files:
                fname = file.lower()
                if 'meta' in fname or fname.endswith('.html') or fname.endswith('.txt'):
                    continue
                
                # Check for known batch patterns or just try opening large files
                path = os.path.join(root, file)
                try:
                    with open(path, 'rb') as f:
                        batch = pickle.load(f, encoding='bytes')
                    
                    if not isinstance(batch, dict):
                        continue
                    
                    # Try to extract data/labels
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
                            if D == 3072: # CIFAR
                                features = features.reshape((N, 3, 32, 32)).transpose(0, 2, 3, 1)
                            elif D == 784: # MNIST
                                features = features.reshape((N, 28, 28))
                        
                        N = len(features)
                        # Process batch
                        for i in range(N):
                            if limit > 0 and count >= limit:
                                return
                            
                            img_data = features[i]
                            if img_data.dtype != np.uint8:
                                img_data = img_data.astype(np.uint8)
                            
                            img = Image.fromarray(img_data)
                            
                            label_idx = labels[i]
                            label_name = label_map.get(label_idx, str(label_idx))
                            
                            yield f"{file}_{i}", img, label_name
                            count += 1
                            
                except Exception:
                    # Not a pickle or readable batch, skip
                    continue

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
            state_dict = torch.load(file_path, map_location=device)
            model.load_state_dict(state_dict)
            model.to(device)
            return model

        elif fmt == ModelFormat.FULL_MODEL:
            model = torch.load(file_path, map_location=device)
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
