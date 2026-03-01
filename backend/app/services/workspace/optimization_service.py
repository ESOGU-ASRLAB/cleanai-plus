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

        prunable_types = (nn.Conv2d, nn.ConvTranspose2d, nn.Linear, nn.BatchNorm2d, nn.LayerNorm)
        layers = []
        for name, module in model.named_modules():
            if not name:
                continue
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
            taylor_num_samples = max(1, int(config.get("taylor_num_samples", 1)))

            device = torch.device(device_str)
            if device_str == "cuda" and not torch.cuda.is_available():
                print("CUDA not available, falling back to CPU")
                device = torch.device("cpu")

            loop = asyncio.get_running_loop()

            # --- Get example inputs ---
            example_inputs, num_classes = await loop.run_in_executor(
                None,
                self._get_example_inputs,
                model_doc,
                dataset_doc,
                preprocessing_doc,
                device,
                config,
            )

            # --- Get calibration samples for Taylor gradient pass ---
            # Only collected when Taylor importance is selected; avoids unnecessary I/O otherwise.
            calibration_inputs = None
            if importance_type == "taylor" and taylor_num_samples > 1:
                calibration_inputs = await loop.run_in_executor(
                    None,
                    self._get_calibration_samples,
                    dataset_doc,
                    preprocessing_doc,
                    device,
                    config,
                    taylor_num_samples,
                    example_inputs,
                )

            # --- Load model ---
            model = await loop.run_in_executor(
                None, self._load_pytorch_model, model_doc, device, num_classes
            )
            model.eval()

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
            )

            pruned_model = result["model"]
            stats = result["stats"]

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
                "original_size_bytes": model_doc.get("file_size_bytes", 0),
                "pruned_size_bytes": file_size,
            }
            await optimization.save()

            print(
                f"Optimization {optimization_id} completed. "
                f"Params: {stats.get('base_params',0):,} → {stats.get('pruned_params',0):,} "
                f"({stats.get('param_reduction_pct',0):.1f}% reduction)"
            )
            _optimization_cancelled.discard(optimization_id)

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
    ) -> List[torch.Tensor]:
        """Return up to *n* individual tensors from the dataset for gradient accumulation.

        Falls back to repeating *fallback_input* (single random/first-image tensor)
        when no dataset is available or fewer than *n* images are found.
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
                    if os.path.splitext(file)[1].lower() in valid_extensions:
                        try:
                            img = Image.open(os.path.join(root, file))
                            if img.mode != "RGB":
                                img = img.convert("RGB")
                            samples.append(preprocess(img).unsqueeze(0).to(device))
                        except Exception:
                            continue
                if len(samples) >= n:
                    break

        # Pad with the fallback (first image / random tensor) if not enough real images
        while len(samples) < n:
            samples.append(fallback_input)

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
    ) -> Dict[str, Any]:
        """Apply torch-pruning structural pruning to the model."""
        try:
            import torch_pruning as tp
        except ImportError:
            raise Exception(
                "torch-pruning is not installed. "
                "Please install it with: pip install torch-pruning"
            )

        # Measure baseline stats
        try:
            base_macs, base_params = tp.utils.count_ops_and_params(
                model, example_inputs
            )
        except Exception as e:
            print(f"Warning: Could not count base ops/params: {e}")
            base_macs = 0
            base_params = int(sum(p.numel() for p in model.parameters()))

        # ------------------------------------------------------------------ #
        # Build importance criterion
        # Available (no-gradient): MagnitudeImportance, GroupMagnitudeImportance,
        #                          BNScaleImportance, LAMPImportance, RandomImportance, FPGMImportance
        # Forward-pass:            ActivationImportance (forward hook calibration)
        # Gradient-based:          TaylorImportance (needs backward pass)
        # ------------------------------------------------------------------ #
        gradient_based = importance_type == "taylor"
        activation_based = importance_type == "activation"

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
        else:
            # Unknown criterion → fall back to L1 magnitude
            print(f"Warning: Unknown importance_type '{importance_type}', falling back to magnitude_l1.")
            imp = tp.importance.MagnitudeImportance(p=1)
            gradient_based = False

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
        # For Taylor importance: run one calibration forward-backward pass
        # so that .grad attributes are populated before the pruner reads them.
        # For Activation importance: run a calibration forward pass inside the
        # compute_importance context manager to populate _importance attributes.
        # ------------------------------------------------------------------ #
        if gradient_based:
            # Use calibration_inputs (N real images) when available; fall back to
            # the single example_inputs. Gradients are accumulated across all samples
            # so the importance scores are averaged over the provided data distribution.
            cal_inputs = calibration_inputs if calibration_inputs else [example_inputs]
            model.train()
            model.zero_grad()
            try:
                for inp in cal_inputs:
                    output = model(inp)
                    # Surrogate scalar loss: sum of logits (no labels needed)
                    loss = output.sum()
                    loss.backward()
            except Exception as e:
                raise Exception(
                    f"Taylor importance requires a gradient pass, which failed: {e}. "
                    "Make sure your model is compatible or choose a different importance criterion."
                )
            model.eval()

        if activation_based:
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
            for _ in range(iterative_steps):
                if optimization_id and optimization_id in _optimization_cancelled:
                    raise InterruptedError("Cancelled by user.")
                pruner.step()
        except InterruptedError:
            raise
        except Exception as e:
            raise Exception(
                f"Pruning step failed: {e}. "
                "This model architecture may not be fully compatible with torch-pruning. "
                "Try a lower pruning ratio or a different importance criterion."
            )

        # ------------------------------------------------------------------ #
        # Measure pruned stats
        # ------------------------------------------------------------------ #
        model.eval()
        try:
            pruned_macs, pruned_params = tp.utils.count_ops_and_params(
                model, example_inputs
            )
        except Exception as e:
            print(f"Warning: Could not count pruned ops/params: {e}")
            pruned_macs = 0
            pruned_params = int(sum(p.numel() for p in model.parameters()))

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

        return {
            "model": model,
            "stats": {
                "base_params": int(base_params),
                "pruned_params": int(pruned_params),
                "param_reduction_pct": param_reduction_pct,
                "base_macs": int(base_macs),
                "pruned_macs": int(pruned_macs),
                "mac_reduction_pct": mac_reduction_pct,
            },
        }
