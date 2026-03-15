import os
import sys
import importlib.util
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

import torch
import torch.nn as nn
from beanie import PydanticObjectId
from bson import ObjectId

from app.models.workspace.optimization import Optimization, OptimizationStatus
from app.models.dataset.dataset import Dataset
from app.models.workspace.preprocessing import Preprocessing
from app.models.ai_model import ModelFormat
from app.schemas.optimization import OptimizationCreate
from app.database.mongodb import get_database
from app.services.email_service import send_optimization_result_email

# In-memory cancellation signals: optimization_id -> cancel requested
_optimization_cancelled: set = set()
# Tracks actively running optimization threads (cleared on completion/failure)
_optimization_running: set = set()
# In-memory progress tracking: optimization_id -> {"progress": int, "message": str}
# Updated throughout the async pipeline and the sync pruning thread.
_optimization_progress: Dict[str, Dict] = {}


class OptimizationService:

    async def create_optimization(self, workspace_id: str, request: OptimizationCreate) -> Optimization:
        optimization = Optimization(
            workspace_id=PydanticObjectId(workspace_id),
            model_id=PydanticObjectId(request.model_id),
            dataset_id=PydanticObjectId(request.dataset_id) if request.dataset_id else None,
            preprocessing_id=PydanticObjectId(request.preprocessing_id) if request.preprocessing_id else None,
            config=request.config,
        )
        await optimization.insert()
        return optimization

    async def get_optimizations(self, workspace_id: str) -> List[Optimization]:
        return (
            await Optimization.find(
                Optimization.workspace_id == PydanticObjectId(workspace_id)
            )
            .sort(-Optimization.created_at)
            .to_list()
        )

    async def get_optimization(self, optimization_id: str) -> Optional[Optimization]:
        return await Optimization.get(PydanticObjectId(optimization_id))

    def get_cancel_requested(self, optimization_id: str) -> bool:
        return optimization_id in _optimization_cancelled

    async def cancel_optimization(self, optimization_id: str) -> bool:
        """Signal the running pruning thread to stop, or cancel immediately if orphaned."""
        optimization = await self.get_optimization(optimization_id)
        if not optimization:
            return False
        if optimization.status not in (OptimizationStatus.PENDING, OptimizationStatus.RUNNING):
            return False
        _optimization_cancelled.add(optimization_id)
        no_active_thread = (
            optimization.status == OptimizationStatus.PENDING
            or optimization_id not in _optimization_running
        )
        if no_active_thread:
            optimization.status = OptimizationStatus.CANCELLED
            optimization.error_message = "Cancelled by user."
            optimization.completed_at = datetime.utcnow()
            await optimization.save()
            _optimization_cancelled.discard(optimization_id)
        return True

    def get_progress(self, optimization_id: str) -> Dict:
        """Return current progress info: {progress: 0-100, message: str}."""
        return _optimization_progress.get(optimization_id, {"progress": 0, "message": "Waiting to start…"})

    async def get_model_layers(self, workspace_id: str, model_id: str) -> List[Dict[str, str]]:
        """Load a PyTorch model and return its prunable named layers."""
        db = await get_database()
        model_doc = await db.ai_models.find_one({"_id": ObjectId(model_id)})
        if not model_doc:
            raise Exception("Model not found.")
        if str(model_doc.get("workspace_id", "")) != workspace_id:
            raise Exception("Model does not belong to this workspace.")

        fmt = model_doc.get("format", "")
        unsupported = [ModelFormat.ONNX, ModelFormat.TORCHSCRIPT]
        if fmt in unsupported:
            raise Exception(f"Format '{fmt}' is not a PyTorch model; layer inspection not supported.")

        loop = asyncio.get_running_loop()
        device = torch.device("cpu")

        model = await loop.run_in_executor(
            None, self._load_pytorch_model, model_doc, device, 10
        )
        model.eval()

        # Dynamically detect all prunable layers using torch-pruning's capabilities
        # Instead of hardcoded tuple, check if layer has prunable parameters
        try:
            import torch_pruning as tp
            
            # Common prunable layer types in torch-pruning
            prunable_types = (
                # Convolutional layers
                nn.Conv1d, nn.Conv2d, nn.Conv3d,
                nn.ConvTranspose1d, nn.ConvTranspose2d, nn.ConvTranspose3d,
                # Linear layers
                nn.Linear,
                # Normalization layers
                nn.BatchNorm1d, nn.BatchNorm2d, nn.BatchNorm3d,
                nn.LayerNorm, nn.GroupNorm,
                nn.InstanceNorm1d, nn.InstanceNorm2d, nn.InstanceNorm3d,
                # Embedding layers
                nn.Embedding,
            )
            
            # Also check for MultiheadAttention if available
            if hasattr(nn, 'MultiheadAttention'):
                prunable_types = prunable_types + (nn.MultiheadAttention,)
                
        except ImportError:
            # Fallback to basic types if torch-pruning not installed
            prunable_types = (nn.Conv2d, nn.ConvTranspose2d, nn.Linear, nn.BatchNorm2d, nn.LayerNorm)
        
        layers = []
        for name, module in model.named_modules():
            if not name:
                continue
            # Check if module is prunable (has weight parameter and is supported type)
            if isinstance(module, prunable_types):
                type_name = type(module).__name__
                # Build a shape hint
                if hasattr(module, "weight") and module.weight is not None:
                    shape = list(module.weight.shape)
                else:
                    shape = []
                layers.append({
                    "name": name,
                    "type": type_name,
                    "shape": shape,
                    "label": f"{name}  [{type_name}  {shape}]",
                })
        return layers

    async def run_optimization(self, optimization_id: str):
        """Main optimization pipeline executed in background."""
        optimization = await self.get_optimization(optimization_id)
        if not optimization:
            print(f"Optimization {optimization_id} not found.")
            return

        try:
            optimization.status = OptimizationStatus.RUNNING
            optimization.started_at = datetime.utcnow()
            await optimization.save()

            # Check if cancelled before we even start heavy work
            if optimization_id in _optimization_cancelled:
                raise InterruptedError("Cancelled by user.")

            _optimization_running.add(optimization_id)
            _optimization_progress[optimization_id] = {"progress": 1, "message": "Initializing…"}
            db = await get_database()

            # --- Fetch resources ---
            model_doc = await db.ai_models.find_one({"_id": optimization.model_id})
            if not model_doc:
                raise Exception("Model not found.")

            dataset_doc = None
            if optimization.dataset_id:
                dataset_doc = await Dataset.get(optimization.dataset_id)
                if not dataset_doc:
                    raise Exception("Dataset not found.")

            preprocessing_doc = None
            if optimization.preprocessing_id:
                preprocessing_doc = await Preprocessing.get(optimization.preprocessing_id)

            # --- Validate format ---
            model_fmt = model_doc.get("format", "")
            unsupported = [ModelFormat.ONNX, ModelFormat.TORCHSCRIPT]
            if model_fmt in unsupported:
                raise Exception(
                    f"Model format '{model_fmt}' is not supported for pruning. "
                    "Only PyTorch models (full_model, state_dict, checkpoint, safetensors) can be pruned."
                )

            config = optimization.config
            pruning_ratio = float(config.get("pruning_ratio", 0.5))
            importance_type = config.get("importance_type", "magnitude_l1")
            iterative_steps = max(1, int(config.get("iterative_steps", 1)))
            device_str = config.get("device", "cpu")
            output_postfix = config.get("output_name_postfix", f"_{importance_type}_pruned")
            global_pruning = bool(config.get("global_pruning", False))
            max_pruning_ratio = float(config.get("max_pruning_ratio", 1.0))
            _round_to = config.get("round_to", None)
            round_to = int(_round_to) if _round_to else None
            isomorphic = bool(config.get("isomorphic", False))
            bn_scale_reg = float(config.get("bn_scale_reg", 1e-5))
            bn_scale_group_lasso = bool(config.get("bn_scale_group_lasso", False))
            ignored_layer_names: List[str] = config.get("ignored_layer_names", [])
            ignore_head = bool(config.get("ignore_head", True))
            calibration_num_samples = max(1, int(config.get("calibration_num_samples", 16)))

            # ------------------------------------------------------------------ #
            # Proportional progress: count every unit of work up front so the
            # bar advances smoothly from 1 % to 99 % with no hardcoded jumps.
            #
            # Fixed units (always present, 10 total):
            #   outer: A1(init) A2(examples) A5(load) A6(post-pruning) A7(save)
            #   inner: B1(baseline) B2(criterion) B5(pruner) B6…(steps) B7(stats)
            # Variable units:
            #   _collect_units : real file-reads (calibration_num_samples, taylor/neuron_coverage/wanda)
            #   A4             : 1 extra advance after collection (taylor/neuron_coverage/wanda)
            #   _cal_units     : backward/forward passes (N for taylor, 1 for activation, 0 for neuron_coverage/wanda)
            #   _bench_units   : benchmark calibration sample collection (all criteria)
            # ------------------------------------------------------------------ #
            _collect_units = calibration_num_samples if importance_type in ("taylor", "neuron_coverage", "wanda") else 0
            _cal_units = (
                calibration_num_samples if importance_type == "taylor"
                else (1 if importance_type == "activation" else 0)
            )
            _bench_units = calibration_num_samples
            _total_units = (
                10
                + _collect_units
                + (1 if importance_type in ("taylor", "neuron_coverage", "wanda") else 0)   # A4
                + _cal_units
                + iterative_steps
                + _bench_units                                # benchmark collection
            )
            _done = [0]

            def _advance(n: int = 1, msg: str = ""):
                """Increment work counter and update live progress (1–99%)."""
                _done[0] += n
                pct = max(1, min(99, round(_done[0] / _total_units * 99)))
                _optimization_progress[optimization_id] = {"progress": pct, "message": msg}

            device = torch.device(device_str)
            if device_str == "cuda" and not torch.cuda.is_available():
                print("CUDA not available, falling back to CPU")
                device = torch.device("cpu")

            loop = asyncio.get_running_loop()

            # --- A1: Get example inputs ---
            _advance(1, "Preparing example inputs…")
            example_inputs, num_classes = await loop.run_in_executor(
                None,
                self._get_example_inputs,
                model_doc,
                dataset_doc,
                preprocessing_doc,
                device,
                config,
            )

            # --- A2 + collect: Calibration sample collection (Taylor, Neuron Coverage, WANDA) ---
            calibration_inputs = None
            if importance_type in ("taylor", "neuron_coverage", "wanda"):
                _advance(1, f"Collecting {calibration_num_samples} calibration sample(s)…")
                calibration_inputs = await loop.run_in_executor(
                    None,
                    self._get_calibration_samples,
                    dataset_doc,
                    preprocessing_doc,
                    device,
                    config,
                    calibration_num_samples,
                    example_inputs,
                    optimization_id,
                    lambda msg: _advance(1, msg),
                )
                _advance(1, "Loading model…")  # A4: collection done
            else:
                _advance(1, "Loading model…")  # A2: examples done (no cal)

            # --- Collect benchmark calibration samples (all criteria) ---
            benchmark_inputs = await loop.run_in_executor(
                None,
                self._get_calibration_samples,
                dataset_doc,
                preprocessing_doc,
                device,
                config,
                calibration_num_samples,
                example_inputs,
                optimization_id,
                lambda msg: _advance(1, msg),
            )

            # --- A5: Load model ---
            model = await loop.run_in_executor(
                None, self._load_pytorch_model, model_doc, device, num_classes
            )
            model.eval()
            _advance(1, "Analyzing model structure…")

            # --- Resolve ignored layers by name ---
            named_modules = dict(model.named_modules())
            user_ignored = [named_modules[n] for n in ignored_layer_names if n in named_modules]

            result = await loop.run_in_executor(
                None,
                self._run_pruning,
                model,
                example_inputs,
                pruning_ratio,
                importance_type,
                iterative_steps,
                device,
                global_pruning,
                max_pruning_ratio,
                round_to,
                isomorphic,
                bn_scale_reg,
                bn_scale_group_lasso,
                user_ignored,
                ignore_head,
                optimization_id,
                calibration_inputs,
                _advance,
                benchmark_inputs,
                config,
            )

            # Cancel may have arrived while _run_pruning was executing its last step
            if optimization_id in _optimization_cancelled:
                raise InterruptedError("Cancelled by user.")

            pruned_model = result["model"]
            stats = result["stats"]
            _timing = result.get("timing", {})
            _layer_changes = result.get("layer_changes", [])

            _advance(1, "Saving pruned model…")  # A6: pruning done

            # --- Save pruned model ---
            workspace_id_str = str(optimization.workspace_id)
            new_model_id = ObjectId()
            workspace_path = os.path.join(
                "uploads", "workspaces", workspace_id_str, "models", str(new_model_id)
            )
            os.makedirs(workspace_path, exist_ok=True)

            original_name = model_doc["name"]
            new_model_name = f"{original_name}{output_postfix}"
            safe_filename = new_model_name.replace(" ", "_").replace("/", "_")
            new_file_path = os.path.join(workspace_path, f"{safe_filename}.pth")

            await loop.run_in_executor(
                None, lambda: torch.save(pruned_model, new_file_path)
            )

            file_size = os.path.getsize(new_file_path)

            # --- Create new model DB entry ---
            new_model_dict = {
                "_id": new_model_id,
                "name": new_model_name,
                "description": (
                    f"Optimized (pruned) version of '{original_name}'. "
                    f"Pruning ratio: {pruning_ratio}, Importance: {importance_type}"
                ),
                "format": ModelFormat.FULL_MODEL,
                "workspace_id": optimization.workspace_id,
                "owner_id": model_doc["owner_id"],
                "file_path": new_file_path,
                "file_size_bytes": file_size,
                "definition_file_path": None,
                "version": "1.0.0",
                "is_optimized": True,
                "original_model_id": model_doc["_id"],
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
            await db.ai_models.insert_one(new_model_dict)
            _advance(1, "Finalizing…")  # A7: model saved

            # --- Update optimization record ---
            optimization.status = OptimizationStatus.COMPLETED
            optimization.completed_at = datetime.utcnow()
            optimization.output_model_id = PydanticObjectId(str(new_model_id))
            optimization.result = {
                "output_model_id": str(new_model_id),
                "output_model_name": new_model_name,
                "original_params": stats.get("base_params", 0),
                "pruned_params": stats.get("pruned_params", 0),
                "param_reduction_pct": stats.get("param_reduction_pct", 0),
                "original_macs": stats.get("base_macs", 0),
                "pruned_macs": stats.get("pruned_macs", 0),
                "mac_reduction_pct": stats.get("mac_reduction_pct", 0),
                "original_flops": stats.get("base_flops", 0),
                "pruned_flops": stats.get("pruned_flops", 0),
                "flop_reduction_pct": stats.get("flop_reduction_pct", 0),
                "original_size_bytes": model_doc.get("file_size_bytes", 0),
                "pruned_size_bytes": file_size,
            }
            await optimization.save()

            # --- Generate PDF report ---
            _report_file_path = None
            try:
                from app.services.report_service import ReportService
                _rpt_svc = ReportService()
                _rpt_doc = await _rpt_svc.generate_optimization_report(
                    optimization=optimization,
                    model_name=original_name,
                    dataset_name=dataset_doc.name if dataset_doc else "—",
                    preprocessing_name=preprocessing_doc.name if preprocessing_doc else None,
                    timing=_timing,
                    layer_changes=_layer_changes,
                )
                _report_file_path = _rpt_doc.file_path
                optimization.result["report_id"] = str(_rpt_doc.id)
                await optimization.save()
            except Exception as _rpt_err:
                print(f"Warning: Failed to generate optimization report: {_rpt_err}")

            print(
                f"Optimization {optimization_id} completed. "
                f"Params: {stats.get('base_params',0):,} → {stats.get('pruned_params',0):,} "
                f"({stats.get('param_reduction_pct',0):.1f}% reduction)"
            )
            _optimization_cancelled.discard(optimization_id)
            _optimization_progress.pop(optimization_id, None)
            _optimization_running.discard(optimization_id)

            # --- Log activity ---
            try:
                from app.services.activity_service import ActivityService
                workspace = await db.workspaces.find_one({"_id": optimization.workspace_id})
                if workspace:
                    activity_svc = ActivityService(db)
                    await activity_svc.log_activity(
                        workspace_id=str(optimization.workspace_id),
                        user_id=str(workspace["owner_id"]),
                        action="optimization_completed",
                        details={
                            "optimization_id": optimization_id,
                            "model_name": model_doc.get("name", "Unknown"),
                            "dataset_name": dataset_doc.name if dataset_doc else "None",
                            "output_model_name": new_model_name,
                            "param_reduction_pct": round(stats.get("param_reduction_pct", 0), 1),
                            "mac_reduction_pct": round(stats.get("mac_reduction_pct", 0), 1),
                        },
                    )
            except Exception as log_err:
                print(f"Failed to log optimization_completed activity: {log_err}")

            # --- Send success email ---
            try:
                workspace = await db.workspaces.find_one({"_id": optimization.workspace_id})
                if workspace:
                    user = await db.users.find_one({"_id": workspace["owner_id"]})
                    if user and user.get("email"):
                        ns = await db.notification_settings.find_one({"user_id": user["_id"]})
                        if not ns or ns.get("optimization_success", True):
                            ok, html = send_optimization_result_email(
                                to_email=user["email"],
                                full_name=user.get("full_name", "User"),
                                optimization_id=optimization_id,
                                workspace_id=str(workspace["_id"]),
                                status="completed",
                                result=optimization.result,
                                config=optimization.config,
                                attachment_path=_report_file_path,
                            )
                            await db.email_logs.insert_one({
                                "user_id": user["_id"],
                                "to_email": user["email"],
                                "subject": f"CleanAI+ - Optimization Completed ({optimization_id[:8]})",
                                "status": "sent" if ok else "failed",
                                "email_type": "optimization_success",
                                "content_html": html,
                                "attachment_base64": None,
                                "error_message": None if ok else "SMTP Error",
                                "sent_at": datetime.utcnow(),
                            })
                            print(f"Optimization success email {'sent' if ok else 'failed'} → {user['email']}")
                        else:
                            print(f"Optimization success email skipped (notification_settings).")
            except Exception as email_err:
                print(f"Failed to process optimization success email: {email_err}")

        except Exception as e:
            import traceback
            if not isinstance(e, InterruptedError):
                traceback.print_exc()
            _optimization_cancelled.discard(optimization_id)
            _optimization_running.discard(optimization_id)
            _optimization_progress.pop(optimization_id, None)

            if isinstance(e, InterruptedError):
                optimization.status = OptimizationStatus.CANCELLED
                optimization.error_message = "Cancelled by user."
            else:
                optimization.status = OptimizationStatus.FAILED
                optimization.error_message = str(e)
            optimization.completed_at = datetime.utcnow()
            await optimization.save()
            print(f"Optimization {optimization_id} {'cancelled' if isinstance(e, InterruptedError) else 'failed'}: {e}")

            if isinstance(e, InterruptedError):
                return

            # --- Log activity ---
            try:
                from app.services.activity_service import ActivityService
                db_log = await get_database()
                workspace = await db_log.workspaces.find_one({"_id": optimization.workspace_id})
                if workspace:
                    activity_svc = ActivityService(db_log)
                    await activity_svc.log_activity(
                        workspace_id=str(optimization.workspace_id),
                        user_id=str(workspace["owner_id"]),
                        action="optimization_failed",
                        details={
                            "optimization_id": optimization_id,
                            "error": str(e)[:200],
                        },
                    )
            except Exception as log_err:
                print(f"Failed to log optimization_failed activity: {log_err}")

            # --- Send failure email ---
            try:
                db = await get_database()
                workspace = await db.workspaces.find_one({"_id": optimization.workspace_id})
                if workspace:
                    user = await db.users.find_one({"_id": workspace["owner_id"]})
                    if user and user.get("email"):
                        ns = await db.notification_settings.find_one({"user_id": user["_id"]})
                        if not ns or ns.get("optimization_failure", True):
                            ok, html = send_optimization_result_email(
                                to_email=user["email"],
                                full_name=user.get("full_name", "User"),
                                optimization_id=optimization_id,
                                workspace_id=str(workspace["_id"]),
                                status="failed",
                                error_message=str(e),
                            )
                            await db.email_logs.insert_one({
                                "user_id": user["_id"],
                                "to_email": user["email"],
                                "subject": f"CleanAI+ - Optimization Failed ({optimization_id[:8]})",
                                "status": "sent" if ok else "failed",
                                "email_type": "optimization_failure",
                                "content_html": html,
                                "attachment_base64": None,
                                "error_message": None if ok else "SMTP Error",
                                "sent_at": datetime.utcnow(),
                            })
                            print(f"Optimization failure email {'sent' if ok else 'failed'} → {user['email']}")
                        else:
                            print(f"Optimization failure email skipped (notification_settings).")
            except Exception as email_err:
                print(f"Failed to process optimization failure email: {email_err}")

    # ------------------------------------------------------------------ #
    #  Helpers                                                              #
    # ------------------------------------------------------------------ #

    def _get_example_inputs(
        self,
        model_doc: dict,
        dataset_doc,
        preprocessing_doc,
        device: torch.device,
        config: dict,
    ) -> Tuple[torch.Tensor, int]:
        """Return (example_input_tensor, num_classes)."""
        from torchvision import transforms
        from PIL import Image

        num_classes = 10

        if dataset_doc:
            if dataset_doc.classes:
                num_classes = len(dataset_doc.classes)

            preprocess = self._build_transforms(preprocessing_doc)

            valid_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
            dataset_root = dataset_doc.path

            for root, dirs, files in os.walk(dataset_root):
                for file in files:
                    if os.path.splitext(file)[1].lower() in valid_extensions:
                        try:
                            img = Image.open(os.path.join(root, file))
                            if img.mode != "RGB":
                                img = img.convert("RGB")
                            tensor = preprocess(img).unsqueeze(0).to(device)
                            return tensor, num_classes
                        except Exception:
                            continue

        # Fallback: random input
        input_size = config.get("input_size", [1, 3, 224, 224])
        if isinstance(input_size, list) and len(input_size) == 4:
            example = torch.randn(*input_size).to(device)
        else:
            example = torch.randn(1, 3, 224, 224).to(device)

        return example, num_classes

    def _get_calibration_samples(
        self,
        dataset_doc,
        preprocessing_doc,
        device: torch.device,
        config: dict,
        n: int,
        fallback_input: torch.Tensor,
        optimization_id: str = "",
        on_sample=None,
    ) -> List[torch.Tensor]:
        """Return exactly *n* tensors for gradient accumulation.

        Calls on_sample(msg) once per sample so the caller can advance a
        proportional progress counter. Works for both dataset images and fallback.
        """
        from PIL import Image

        samples: List[torch.Tensor] = []

        if dataset_doc:
            preprocess = self._build_transforms(preprocessing_doc)
            valid_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
            dataset_root = dataset_doc.path

            for root, _dirs, files in os.walk(dataset_root):
                for file in files:
                    if len(samples) >= n:
                        break
                    if optimization_id and optimization_id in _optimization_cancelled:
                        break
                    if os.path.splitext(file)[1].lower() in valid_extensions:
                        try:
                            img = Image.open(os.path.join(root, file))
                            if img.mode != "RGB":
                                img = img.convert("RGB")
                            samples.append(preprocess(img).unsqueeze(0).to(device))
                            if on_sample:
                                on_sample(f"Collecting calibration samples: {len(samples)} / {n}…")
                        except Exception:
                            continue
                if len(samples) >= n or (optimization_id and optimization_id in _optimization_cancelled):
                    break

        # Pad with fallback — still call on_sample so counter advances correctly
        while len(samples) < n:
            samples.append(fallback_input)
            if on_sample:
                on_sample(f"Collecting calibration samples: {len(samples)} / {n}…")

        return samples

    def _build_transforms(self, preprocessing_doc):
        """Build torchvision transforms from preprocessing definition."""
        from torchvision import transforms

        if not preprocessing_doc or (
            not preprocessing_doc.steps and not preprocessing_doc.code
        ):
            return transforms.Compose(
                [transforms.Resize((224, 224)), transforms.ToTensor()]
            )

        transform_list = []

        if preprocessing_doc.mode == "code" and preprocessing_doc.code:
            try:
                import numpy as np
                from PIL import Image as PILImage

                scope = {
                    "torch": torch,
                    "transforms": transforms,
                    "Image": PILImage,
                    "np": np,
                }
                exec(preprocessing_doc.code, scope)
                if "get_transform" in scope:
                    return scope["get_transform"]()
            except Exception as e:
                print(f"Custom preprocessing code error: {e}")

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
                        transform_list.append(
                            transforms.Grayscale(
                                num_output_channels=int(
                                    params.get("num_output_channels", 3)
                                )
                            )
                        )
                    elif s_type == "ToTensor":
                        transform_list.append(transforms.ToTensor())
                    elif s_type == "Normalize":
                        mean = params.get("mean", [0.485, 0.456, 0.406])
                        std = params.get("std", [0.229, 0.224, 0.225])
                        transform_list.append(transforms.Normalize(mean=mean, std=std))
                except Exception:
                    pass

        has_to_tensor = any(isinstance(t, transforms.ToTensor) for t in transform_list)
        if not has_to_tensor:
            norm_indices = [
                i
                for i, t in enumerate(transform_list)
                if isinstance(t, transforms.Normalize)
            ]
            if norm_indices:
                transform_list.insert(norm_indices[0], transforms.ToTensor())
            else:
                transform_list.append(transforms.ToTensor())

        return transforms.Compose(transform_list)

    def _load_pytorch_model(
        self, model_doc: dict, device: torch.device, num_classes: int = 10
    ) -> nn.Module:
        """Load a PyTorch model as nn.Module for pruning."""
        file_path = model_doc["file_path"]
        fmt = model_doc.get("format", "")

        def _load_definition(namespace: str):
            def_path = model_doc.get("definition_file_path")
            if def_path and os.path.exists(def_path):
                spec = importlib.util.spec_from_file_location(namespace, def_path)
                module = importlib.util.module_from_spec(spec)
                sys.modules[namespace] = module
                spec.loader.exec_module(module)
                # Inject into __main__ so torch.load can unpickle
                import __main__
                for attr in dir(module):
                    if not attr.startswith("_"):
                        setattr(__main__, attr, getattr(module, attr))
                return module
            return None

        def _find_module_class(module):
            if module is None:
                return None
            for _, obj in module.__dict__.items():
                if (
                    isinstance(obj, type)
                    and issubclass(obj, nn.Module)
                    and obj is not nn.Module
                ):
                    return obj
            return None

        if fmt == ModelFormat.FULL_MODEL:
            _load_definition("model_def_opt_full")
            model = torch.load(file_path, map_location=device, weights_only=False)
            if not isinstance(model, nn.Module):
                raise Exception(
                    "Loaded file is not a PyTorch nn.Module. "
                    "Ensure the model was saved with torch.save(model, path)."
                )
            model.to(device)
            return model

        elif fmt in [ModelFormat.STATE_DICT, ModelFormat.CHECKPOINT]:
            module = _load_definition("model_def_opt_sd")
            model_class = _find_module_class(module)
            if model_class is None:
                raise Exception(
                    "State dict models require a definition file (.py) for structural pruning. "
                    "Please provide a model definition file when uploading."
                )
            model = model_class()
            state = torch.load(file_path, map_location=device, weights_only=False)
            if isinstance(state, dict):
                if "state_dict" in state:
                    state = state["state_dict"]
                elif "model" in state:
                    state = state["model"]
            model.load_state_dict(state)
            model.to(device)
            return model

        elif fmt == ModelFormat.SAFETENSORS:
            from safetensors.torch import load_file

            module = _load_definition("model_def_opt_st")
            model_class = _find_module_class(module)
            if model_class is None:
                raise Exception(
                    "Safetensors models require a definition file (.py) for structural pruning."
                )
            model = model_class()
            state = load_file(file_path)
            model.load_state_dict(state)
            model.to(device)
            return model

        else:
            raise Exception(
                f"Model format '{fmt}' is not supported for pruning. "
                "Supported formats: full_model, state_dict, checkpoint, safetensors."
            )

    def _run_pruning(
        self,
        model: nn.Module,
        example_inputs: torch.Tensor,
        pruning_ratio: float,
        importance_type: str,
        iterative_steps: int,
        device: torch.device,
        global_pruning: bool = False,
        max_pruning_ratio: float = 1.0,
        round_to: int = None,
        isomorphic: bool = False,
        bn_scale_reg: float = 1e-5,
        bn_scale_group_lasso: bool = False,
        user_ignored: list = None,
        ignore_head: bool = True,
        optimization_id: str = "",
        calibration_inputs: Optional[List[torch.Tensor]] = None,
        progress_callback=None,
        benchmark_inputs: Optional[List[torch.Tensor]] = None,
        config: dict = None,
    ) -> Dict[str, Any]:

        def _report(n: int, msg: str):
            if progress_callback:
                progress_callback(n, msg)
        """Apply torch-pruning structural pruning to the model."""
        
        # Default config if not provided
        if config is None:
            config = {}
        
        try:
            import torch_pruning as tp
        except ImportError:
            raise Exception(
                "torch-pruning is not installed. "
                "Please install it with: pip install torch-pruning"
            )

        # Measure baseline stats — B1
        try:
            base_macs, base_params = tp.utils.count_ops_and_params(
                model, example_inputs
            )
        except Exception as e:
            print(f"Warning: Could not count base ops/params: {e}")
            base_macs = 0
            base_params = int(sum(p.numel() for p in model.parameters()))
        _report(1, "Building importance criterion…")  # B1: baseline done

        # ------------------------------------------------------------------ #
        # Build importance criterion
        # Available (no-gradient): MagnitudeImportance, GroupMagnitudeImportance,
        #                          BNScaleImportance, LAMPImportance, RandomImportance, FPGMImportance
        # Forward-pass:            ActivationImportance (forward hook calibration)
        # Gradient-based:          TaylorImportance (needs backward pass)
        # ------------------------------------------------------------------ #
        gradient_based = importance_type == "taylor"
        activation_based = importance_type == "activation"
        coverage_based = importance_type == "neuron_coverage"
        wanda_based = importance_type == "wanda"

        if importance_type == "magnitude_l1":
            imp = tp.importance.MagnitudeImportance(p=1)
        elif importance_type == "magnitude_l2":
            imp = tp.importance.MagnitudeImportance(p=2)
        elif importance_type == "group_magnitude_l1":
            imp = tp.importance.GroupMagnitudeImportance(p=1, group_reduction="mean")
        elif importance_type == "group_magnitude_l2":
            imp = tp.importance.GroupMagnitudeImportance(p=2, group_reduction="mean")
        elif importance_type == "lamp":
            imp = tp.importance.LAMPImportance()
        elif importance_type == "activation":
            imp = tp.importance.ActivationImportance()
        elif importance_type == "random":
            imp = tp.importance.RandomImportance()
        elif importance_type == "bn_scale":
            imp = tp.importance.BNScaleImportance()
        elif importance_type == "fpgm":
            imp = tp.importance.FPGMImportance()
        elif importance_type == "taylor":
            imp = tp.importance.TaylorImportance()
        elif importance_type == "neuron_coverage":
            # Data-driven importance based on neuron activation coverage
            from .neuron_coverage_importance import NeuronCoverageImportance
            coverage_metric = config.get("coverage_metric", "normalized_mean")
            imp = NeuronCoverageImportance(
                calibration_inputs=calibration_inputs if calibration_inputs else [example_inputs],
                coverage_metric=coverage_metric
            )
        elif importance_type == "wanda":
            # WANDA: Weight AND Activation importance (multiply weight × activation)
            from .wanda_importance import WandaImportance
            weight_norm = config.get("wanda_weight_norm", "l2")
            imp = WandaImportance(
                calibration_inputs=calibration_inputs if calibration_inputs else [example_inputs],
                weight_norm=weight_norm
            )
        else:
            print(f"Warning: Unknown importance_type '{importance_type}', falling back to magnitude_l1.")
            imp = tp.importance.MagnitudeImportance(p=1)
            gradient_based = False

        # B2: criterion done — announce next stage
        if gradient_based or activation_based or coverage_based or wanda_based:
            _report(1, "Running calibration pass…")
        else:
            _report(1, f"Building pruner for {iterative_steps} pruning step(s)…")

        # ------------------------------------------------------------------ #
        # Build ignored_layers list
        #   1. User-selected layers (resolved by name before this call)
        #   2. Optionally: last Linear layer (classifier head)
        # ------------------------------------------------------------------ #
        ignored_layers = list(user_ignored) if user_ignored else []
        if ignore_head:
            last_linear = None
            for m in model.modules():
                if isinstance(m, nn.Linear):
                    last_linear = m
            if last_linear is not None and last_linear not in ignored_layers:
                ignored_layers.append(last_linear)

        # ------------------------------------------------------------------ #
        # Pruner selection
        #   BasePruner  ← covers all importance types (magnitude, lamp, random,
        #                 taylor, fpgm). tp.pruner.MetaPruner is an alias.
        #   BNScalePruner ← must be used when importance is BNScaleImportance;
        #                    requires BatchNorm layers in the model.
        # ------------------------------------------------------------------ #
        if importance_type == "bn_scale":
            PrunerClass = tp.pruner.BNScalePruner
        else:
            # BasePruner handles all other importance criteria
            PrunerClass = tp.pruner.BasePruner  # same as MetaPruner / MagnitudePruner

        # ------------------------------------------------------------------ #
        # Calibration passes (before pruner is built)
        if gradient_based:
            cal_inputs = calibration_inputs if calibration_inputs else [example_inputs]
            n_total = len(cal_inputs)
            model.train()
            model.zero_grad()
            try:
                for sample_idx, sample in enumerate(cal_inputs):
                    # Check cancellation before every sample
                    if optimization_id and optimization_id in _optimization_cancelled:
                        raise InterruptedError("Cancelled by user.")
                    # Process one sample at a time to avoid CUDA OOM.
                    # TaylorImportance reads .grad which accumulates across all
                    # samples — zero_grad is NOT called between samples intentionally.
                    output = model(sample)  # sample is already [1, C, H, W]
                    loss = output.sum()
                    loss.backward()
                    # Free activation memory immediately after each backward
                    if device.type == "cuda":
                        torch.cuda.empty_cache()
                    processed = sample_idx + 1
                    _report(1, f"Calibration: {processed} / {n_total} samples processed…")  # B3
            except InterruptedError:
                raise
            except (RuntimeError, torch.cuda.OutOfMemoryError if hasattr(torch.cuda, 'OutOfMemoryError') else RuntimeError) as e:
                if "out of memory" in str(e).lower():
                    raise Exception(
                        f"CUDA out of memory during Taylor calibration pass. "
                        "Try reducing 'Calibration Samples', switching device to CPU, or choosing a different importance criterion."
                    )
                raise Exception(
                    f"Taylor importance requires a gradient pass, which failed: {e}. "
                    "Make sure your model is compatible or choose a different importance criterion."
                )
            except Exception as e:
                raise Exception(
                    f"Taylor importance requires a gradient pass, which failed: {e}. "
                    "Make sure your model is compatible or choose a different importance criterion."
                )
            model.eval()

        if activation_based:
            if optimization_id and optimization_id in _optimization_cancelled:
                raise InterruptedError("Cancelled by user.")
            model.eval()
            try:
                with imp.compute_importance(model):
                    with torch.no_grad():
                        model(example_inputs)
            except Exception as e:
                raise Exception(
                    f"Activation importance calibration forward pass failed: {e}. "
                    "Make sure your model is compatible or choose a different importance criterion."
                )
            _report(1, f"Building pruner for {iterative_steps} pruning step(s)…")  # B4: activation cal done

        # ------------------------------------------------------------------ #
        # Measure inference time BEFORE pruning + collect layer shapes
        # ------------------------------------------------------------------ #
        import time as _time
        _bench = benchmark_inputs if benchmark_inputs else [example_inputs]
        _N_WARMUP = 10  # Increased from 3 for more reliable measurements
        _before_ms, _before_throughput = 0.0, 0.0
        try:
            model.eval()
            # More extensive warmup for accurate baseline
            with torch.no_grad():
                for _ in range(_N_WARMUP):
                    for _bi in _bench:
                        model(_bi)
            if hasattr(device, "type") and device.type == "cuda":
                torch.cuda.synchronize()
                torch.cuda.empty_cache()  # Clear cache for clean measurement
            
            # Actual timing measurement with multiple runs for stability
            _timings = []
            for _ in range(3):  # Take average of 3 runs
                _t0 = _time.perf_counter()
                with torch.no_grad():
                    for _bi in _bench:
                        model(_bi)
                if hasattr(device, "type") and device.type == "cuda":
                    torch.cuda.synchronize()
                _t1 = _time.perf_counter()
                _timings.append(_t1 - _t0)
            
            # Use median to avoid outliers
            _timings.sort()
            _elapsed = _timings[1]  # median of 3
            _before_ms = _elapsed / len(_bench) * 1000
            _before_throughput = len(_bench) / _elapsed
        except Exception as _te:
            print(f"Warning: Could not measure pre-pruning inference time: {_te}")

        _before_shapes = {}
        for _n, _m in model.named_modules():
            if isinstance(_m, nn.Conv2d):
                # Conv2d params: out_ch * in_ch * k * k + (out_ch if bias else 0)
                _params = _m.out_channels * _m.in_channels * _m.kernel_size[0] * _m.kernel_size[1]
                if _m.bias is not None:
                    _params += _m.out_channels
                _before_shapes[_n] = {"type": "Conv2d", "out": _m.out_channels, "in": _m.in_channels, "params": _params}
            elif isinstance(_m, nn.Linear):
                # Linear params: out_feat * in_feat + (out_feat if bias else 0)
                _params = _m.out_features * _m.in_features
                if _m.bias is not None:
                    _params += _m.out_features
                _before_shapes[_n] = {"type": "Linear", "out": _m.out_features, "in": _m.in_features, "params": _params}
            elif isinstance(_m, (nn.BatchNorm1d, nn.BatchNorm2d)):
                # BatchNorm params: 2 * num_features (gamma + beta)
                _params = 2 * _m.num_features
                _before_shapes[_n] = {"type": type(_m).__name__, "out": _m.num_features, "in": _m.num_features, "params": _params}

        # ------------------------------------------------------------------ #
        # Build pruner and run iterative pruning steps
        # ------------------------------------------------------------------ #
        pruner_kwargs = dict(
            importance=imp,
            pruning_ratio=pruning_ratio,
            ignored_layers=ignored_layers,
            iterative_steps=iterative_steps,
            global_pruning=global_pruning,
            max_pruning_ratio=max_pruning_ratio,
            round_to=round_to,
            isomorphic=isomorphic,
        )
        if importance_type == "bn_scale":
            pruner_kwargs["reg"] = bn_scale_reg
            pruner_kwargs["group_lasso"] = bn_scale_group_lasso
        try:
            pruner = PrunerClass(model, example_inputs, **pruner_kwargs)
            _report(1, f"Pruning: step 1 / {iterative_steps}…")  # B5: pruner built
            for step_idx in range(iterative_steps):
                if optimization_id and optimization_id in _optimization_cancelled:
                    raise InterruptedError("Cancelled by user.")
                pruner.step()
                # Check AFTER the step too
                if optimization_id and optimization_id in _optimization_cancelled:
                    raise InterruptedError("Cancelled by user.")
                next_msg = (
                    f"Pruning: step {step_idx + 2} / {iterative_steps}…"
                    if step_idx + 1 < iterative_steps
                    else "Measuring compression statistics…"
                )
                _report(1, next_msg)  # B6
        except InterruptedError:
            raise
        except Exception as e:
            raise Exception(
                f"Pruning step failed: {e}. "
                "This model architecture may not be fully compatible with torch-pruning. "
                "Try a lower pruning ratio or a different importance criterion."
            )

        # Collect layer shapes AFTER pruning + compute changes
        _after_shapes = {}
        for _lname, _lm in model.named_modules():
            if isinstance(_lm, nn.Conv2d):
                _params = _lm.out_channels * _lm.in_channels * _lm.kernel_size[0] * _lm.kernel_size[1]
                if _lm.bias is not None:
                    _params += _lm.out_channels
                _after_shapes[_lname] = {"type": "Conv2d",
                                          "out": _lm.out_channels, "in": _lm.in_channels, "params": _params}
            elif isinstance(_lm, nn.Linear):
                _params = _lm.out_features * _lm.in_features
                if _lm.bias is not None:
                    _params += _lm.out_features
                _after_shapes[_lname] = {"type": "Linear",
                                          "out": _lm.out_features, "in": _lm.in_features, "params": _params}
            elif isinstance(_lm, (nn.BatchNorm1d, nn.BatchNorm2d)):
                _params = 2 * _lm.num_features
                _after_shapes[_lname] = {"type": type(_lm).__name__,
                                          "out": _lm.num_features, "in": _lm.num_features, "params": _params}
        _layer_changes = []
        for _lname, _b in _before_shapes.items():
            _a = _after_shapes.get(_lname)
            if _a and _b["out"] != _a["out"]:
                _red = round((1 - _a["out"] / max(_b["out"], 1)) * 100, 1)
                _params_red = round((1 - _a["params"] / max(_b["params"], 1)) * 100, 1) if _b.get("params") and _a.get("params") else _red
                _layer_changes.append({
                    "name": _lname, "type": _b["type"],
                    "before_in": _b["in"], "before_out": _b["out"],
                    "after_in":  _a["in"], "after_out":  _a["out"],
                    "before_params": _b.get("params", 0),
                    "after_params": _a.get("params", 0),
                    "reduction_pct": _red,
                    "params_reduction_pct": _params_red,
                })
        _layer_changes.sort(key=lambda x: x["params_reduction_pct"], reverse=True)

        # Measure pruned stats — B7
        model.eval()
        try:
            pruned_macs, pruned_params = tp.utils.count_ops_and_params(
                model, example_inputs
            )
        except Exception as e:
            print(f"Warning: Could not count pruned ops/params: {e}")
            pruned_macs = 0
            pruned_params = int(sum(p.numel() for p in model.parameters()))

        # Measure inference time AFTER pruning
        _after_ms, _after_throughput = 0.0, 0.0
        try:
            model.eval()
            # Extensive warmup for pruned model (needs more due to irregular structure)
            with torch.no_grad():
                for _ in range(_N_WARMUP * 2):  # Extra warmup for pruned model
                    for _bi in _bench:
                        model(_bi)
            if hasattr(device, "type") and device.type == "cuda":
                torch.cuda.synchronize()
                torch.cuda.empty_cache()
            
            # Actual timing measurement with multiple runs
            _timings = []
            for _ in range(3):  # Take average of 3 runs
                _t0 = _time.perf_counter()
                with torch.no_grad():
                    for _bi in _bench:
                        model(_bi)
                if hasattr(device, "type") and device.type == "cuda":
                    torch.cuda.synchronize()
                _t1 = _time.perf_counter()
                _timings.append(_t1 - _t0)
            
            # Use median to avoid outliers
            _timings.sort()
            _elapsed = _timings[1]  # median of 3
            _after_ms = _elapsed / len(_bench) * 1000
            _after_throughput = len(_bench) / _elapsed
        except Exception as _te:
            print(f"Warning: post-pruning timing failed: {_te}")

        _report(1, "Saving model…")  # B7: stats done

        param_reduction_pct = (
            round((1 - pruned_params / max(base_params, 1)) * 100, 2)
            if base_params > 0
            else 0.0
        )
        mac_reduction_pct = (
            round((1 - pruned_macs / max(base_macs, 1)) * 100, 2)
            if base_macs > 0
            else 0.0
        )

        # FLOPs = 2 × MACs (each MAC = 1 multiply + 1 add = 2 FLOPs)
        base_flops   = int(base_macs) * 2
        pruned_flops = int(pruned_macs) * 2
        # Reduction ratio is identical to MACs since it's a linear scaling
        flop_reduction_pct = mac_reduction_pct

        return {
            "model": model,
            "stats": {
                "base_params": int(base_params),
                "pruned_params": int(pruned_params),
                "param_reduction_pct": param_reduction_pct,
                "base_macs": int(base_macs),
                "pruned_macs": int(pruned_macs),
                "mac_reduction_pct": mac_reduction_pct,
                "base_flops": base_flops,
                "pruned_flops": pruned_flops,
                "flop_reduction_pct": flop_reduction_pct,
            },
            "timing": {
                "before_ms":          _before_ms,
                "after_ms":           _after_ms,
                "before_throughput":  _before_throughput,
                "after_throughput":   _after_throughput,
            },
            "layer_changes": _layer_changes,
        }
