import os
import sys
import copy
import importlib.util
import asyncio
import time as _time
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

import torch
import torch.nn as nn
from beanie import PydanticObjectId
from bson import ObjectId

from app.models.workspace.quantization import Quantization, QuantizationStatus
from app.models.dataset.dataset import Dataset
from app.models.workspace.preprocessing import Preprocessing
from app.models.ai_model import ModelFormat
from app.schemas.quantization import QuantizationCreate
from app.database.mongodb import get_database
from app.services.email_service import send_optimization_result_email

# In-memory cancellation signals
_quantization_cancelled: set = set()
_quantization_running: set = set()
_quantization_progress: Dict[str, Dict] = {}


class QuantizationService:

    async def create_quantization(self, workspace_id: str, request: QuantizationCreate) -> Quantization:
        quantization = Quantization(
            workspace_id=PydanticObjectId(workspace_id),
            model_id=PydanticObjectId(request.model_id),
            dataset_id=PydanticObjectId(request.dataset_id) if request.dataset_id else None,
            preprocessing_id=PydanticObjectId(request.preprocessing_id) if request.preprocessing_id else None,
            config=request.config,
        )
        await quantization.insert()
        return quantization

    async def get_quantizations(self, workspace_id: str) -> List[Quantization]:
        return (
            await Quantization.find(
                Quantization.workspace_id == PydanticObjectId(workspace_id)
            )
            .sort(-Quantization.created_at)
            .to_list()
        )

    async def get_quantization(self, quantization_id: str) -> Optional[Quantization]:
        return await Quantization.get(PydanticObjectId(quantization_id))

    async def delete_quantization(self, quantization_id: str) -> bool:
        quantization = await self.get_quantization(quantization_id)
        if not quantization:
            return False
        if quantization.status in (QuantizationStatus.PENDING, QuantizationStatus.RUNNING):
            _quantization_cancelled.add(quantization_id)
            _quantization_progress.pop(quantization_id, None)
            _quantization_running.discard(quantization_id)
        await quantization.delete()
        return True

    def get_cancel_requested(self, quantization_id: str) -> bool:
        return quantization_id in _quantization_cancelled

    async def cancel_quantization(self, quantization_id: str) -> bool:
        quantization = await self.get_quantization(quantization_id)
        if not quantization:
            return False
        if quantization.status not in (QuantizationStatus.PENDING, QuantizationStatus.RUNNING):
            return False
        _quantization_cancelled.add(quantization_id)
        no_active_thread = (
            quantization.status == QuantizationStatus.PENDING
            or quantization_id not in _quantization_running
        )
        if no_active_thread:
            quantization.status = QuantizationStatus.CANCELLED
            quantization.error_message = "Cancelled by user."
            quantization.completed_at = datetime.utcnow()
            await quantization.save()
            _quantization_cancelled.discard(quantization_id)
        return True

    def get_progress(self, quantization_id: str) -> Dict:
        return _quantization_progress.get(quantization_id, {"progress": 0, "message": "Waiting to start…"})

    async def run_quantization(self, quantization_id: str):
        quantization = await self.get_quantization(quantization_id)
        if not quantization:
            print(f"Quantization {quantization_id} not found.")
            return

        try:
            quantization.status = QuantizationStatus.RUNNING
            quantization.started_at = datetime.utcnow()
            await quantization.save()

            if quantization_id in _quantization_cancelled:
                raise InterruptedError("Cancelled by user.")

            _quantization_running.add(quantization_id)
            _quantization_progress[quantization_id] = {"progress": 1, "message": "Initializing…"}
            db = await get_database()

            # --- Fetch resources ---
            model_doc = await db.ai_models.find_one({"_id": quantization.model_id})
            if not model_doc:
                raise Exception("Model not found.")

            dataset_doc = None
            if quantization.dataset_id:
                dataset_doc = await Dataset.get(quantization.dataset_id)
                if not dataset_doc:
                    raise Exception("Dataset not found.")

            preprocessing_doc = None
            if quantization.preprocessing_id:
                preprocessing_doc = await Preprocessing.get(quantization.preprocessing_id)

            # --- Validate format ---
            model_fmt = model_doc.get("format", "")
            unsupported = [ModelFormat.ONNX, ModelFormat.TORCHSCRIPT]
            if model_fmt in unsupported:
                raise Exception(
                    f"Model format '{model_fmt}' is not supported for quantization. "
                    "Only PyTorch models (full_model, state_dict, checkpoint, safetensors) can be quantized."
                )

            config = quantization.config
            quantization_type = config.get("quantization_type", "dynamic")
            bit_width = config.get("bit_width", "int8")
            backend = config.get("backend", "fbgemm")
            target_layer_types = config.get("target_layer_types", ["all"])
            per_channel = bool(config.get("per_channel", True))
            calibration_num_samples = max(1, int(config.get("calibration_num_samples", 128)))
            output_postfix = config.get("output_name_postfix", f"_quant_{bit_width}")
            device_str = config.get("device", "cpu")

            # Progress tracking
            _total_units = 8
            if quantization_type == "static":
                _total_units += calibration_num_samples
            _done = [0]

            def _advance(n: int = 1, msg: str = ""):
                _done[0] += n
                pct = max(1, min(99, round(_done[0] / _total_units * 99)))
                _quantization_progress[quantization_id] = {"progress": pct, "message": msg}

            device = torch.device(device_str)
            if device_str == "cuda" and not torch.cuda.is_available():
                print("CUDA not available, falling back to CPU")
                device = torch.device("cpu")

            loop = asyncio.get_running_loop()

            # --- Step 1: Get example inputs ---
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

            if quantization_id in _quantization_cancelled:
                raise InterruptedError("Cancelled by user.")

            # --- Step 2: Load model ---
            _advance(1, "Loading model…")
            model = await loop.run_in_executor(
                None, self._load_pytorch_model, model_doc, device, num_classes
            )
            model.eval()

            # --- Step 3: Measure before metrics ---
            _advance(1, "Measuring baseline performance…")
            original_size = os.path.getsize(model_doc["file_path"])
            before_ms, before_throughput = await loop.run_in_executor(
                None, self._measure_inference_time, model, example_inputs, device
            )

            if quantization_id in _quantization_cancelled:
                raise InterruptedError("Cancelled by user.")

            # --- Step 4: Run quantization ---
            _advance(1, f"Applying {quantization_type} quantization ({bit_width})…")
            q_model = await loop.run_in_executor(
                None,
                self._run_quantization,
                model,
                quantization_type,
                bit_width,
                backend,
                target_layer_types,
                per_channel,
                dataset_doc,
                preprocessing_doc,
                device,
                config,
                calibration_num_samples,
                quantization_id,
                lambda n, msg: _advance(n, msg),
            )

            if quantization_id in _quantization_cancelled:
                raise InterruptedError("Cancelled by user.")

            _advance(1, "Saving quantized model…")

            # --- Step 5: Save quantized model ---
            workspace_id_str = str(quantization.workspace_id)
            new_model_id = ObjectId()
            workspace_path = os.path.join(
                "uploads", "workspaces", workspace_id_str, "models", str(new_model_id)
            )
            os.makedirs(workspace_path, exist_ok=True)

            original_name = model_doc["name"]
            new_model_name = f"{original_name}{output_postfix}"
            safe_filename = new_model_name.replace(" ", "_").replace("/", "_")

            # Static quantized models must be saved via TorchScript
            # because quantized modules (QuantizedConv2d, ConvReLU2d etc.)
            # do not survive pickle (torch.save) roundtrip.
            is_static = quantization_type == "static"
            if is_static:
                new_file_path = os.path.join(workspace_path, f"{safe_filename}.pt")
                model_format = ModelFormat.TORCHSCRIPT

                def _save_torchscript():
                    q_model.eval()
                    dummy = example_inputs[:1].cpu()
                    traced = torch.jit.trace(q_model.cpu(), dummy)
                    torch.jit.save(traced, new_file_path)

                await loop.run_in_executor(None, _save_torchscript)
            else:
                new_file_path = os.path.join(workspace_path, f"{safe_filename}.pth")
                model_format = ModelFormat.FULL_MODEL
                await loop.run_in_executor(
                    None, lambda: torch.save(q_model, new_file_path)
                )

            file_size = os.path.getsize(new_file_path)

            # --- Step 6: Measure after metrics ---
            _advance(1, "Measuring quantized model performance…")
            # For quantized models, measure on CPU (quantized ops are CPU-optimized for int8)
            q_device = torch.device("cpu") if bit_width in ("int8",) else device
            after_ms, after_throughput = await loop.run_in_executor(
                None, self._measure_inference_time, q_model, example_inputs.to(q_device), q_device
            )

            # Determine recommended deployment target
            recommended_device = self._get_recommended_device(quantization_type, bit_width)

            # --- Create new model DB entry ---
            new_model_dict = {
                "_id": new_model_id,
                "name": new_model_name,
                "description": (
                    f"Quantized version of '{original_name}'. "
                    f"Type: {quantization_type}, Bit width: {bit_width}"
                ),
                "format": model_format,
                "workspace_id": quantization.workspace_id,
                "owner_id": model_doc["owner_id"],
                "file_path": new_file_path,
                "file_size_bytes": file_size,
                "definition_file_path": None,
                "version": "1.0.0",
                "is_optimized": True,
                "optimization_type": quantization_type,
                "quantization_backend": backend,
                "original_model_id": model_doc["_id"],
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
            await db.ai_models.insert_one(new_model_dict)
            _advance(1, "Finalizing…")

            # --- Update quantization record ---
            size_reduction_pct = round((1 - file_size / max(original_size, 1)) * 100, 2) if original_size > 0 else 0.0
            speedup_factor = round(before_ms / max(after_ms, 0.001), 2) if before_ms > 0 and after_ms > 0 else 0.0

            quantization.status = QuantizationStatus.COMPLETED
            quantization.completed_at = datetime.utcnow()
            quantization.output_model_id = PydanticObjectId(str(new_model_id))
            quantization.result = {
                "output_model_id": str(new_model_id),
                "output_model_name": new_model_name,
                "quantization_type": quantization_type,
                "bit_width": bit_width,
                "original_size_bytes": original_size,
                "quantized_size_bytes": file_size,
                "size_reduction_pct": size_reduction_pct,
                "before_inference_ms": round(before_ms, 3),
                "after_inference_ms": round(after_ms, 3),
                "speedup_factor": speedup_factor,
                "before_throughput": round(before_throughput, 2),
                "after_throughput": round(after_throughput, 2),
                "recommended_device": recommended_device,
            }
            await quantization.save()

            # --- Generate PDF report ---
            try:
                from app.services.report_service import ReportService
                _rpt_svc = ReportService()
                _rpt_doc = await _rpt_svc.generate_quantization_report(
                    quantization=quantization,
                    model_name=original_name,
                    dataset_name=dataset_doc.name if dataset_doc else "—",
                )
            except Exception as _rpt_err:
                print(f"Warning: Failed to generate quantization report: {_rpt_err}")

            print(
                f"Quantization {quantization_id} completed. "
                f"Size: {original_size:,} → {file_size:,} bytes "
                f"({size_reduction_pct:.1f}% reduction)"
            )
            _quantization_cancelled.discard(quantization_id)
            _quantization_progress.pop(quantization_id, None)
            _quantization_running.discard(quantization_id)

            # --- Log activity ---
            try:
                from app.services.activity_service import ActivityService
                workspace = await db.workspaces.find_one({"_id": quantization.workspace_id})
                if workspace:
                    activity_svc = ActivityService(db)
                    await activity_svc.log_activity(
                        workspace_id=str(quantization.workspace_id),
                        user_id=str(workspace["owner_id"]),
                        action="quantization_completed",
                        details={
                            "quantization_id": quantization_id,
                            "model_name": model_doc.get("name", "Unknown"),
                            "output_model_name": new_model_name,
                            "quantization_type": quantization_type,
                            "bit_width": bit_width,
                            "size_reduction_pct": size_reduction_pct,
                        },
                    )
            except Exception as log_err:
                print(f"Failed to log quantization_completed activity: {log_err}")

            # --- Send success email ---
            try:
                workspace = await db.workspaces.find_one({"_id": quantization.workspace_id})
                if workspace:
                    user = await db.users.find_one({"_id": workspace["owner_id"]})
                    if user and user.get("email"):
                        ns = await db.notification_settings.find_one({"user_id": user["_id"]})
                        if not ns or ns.get("optimization_success", True):
                            ok, html = send_optimization_result_email(
                                to_email=user["email"],
                                full_name=user.get("full_name", "User"),
                                optimization_id=quantization_id,
                                workspace_id=str(workspace["_id"]),
                                status="completed",
                                result=quantization.result,
                                config=quantization.config,
                            )
                            await db.email_logs.insert_one({
                                "user_id": user["_id"],
                                "to_email": user["email"],
                                "subject": f"CleanAI+ - Quantization Completed ({quantization_id[:8]})",
                                "status": "sent" if ok else "failed",
                                "email_type": "quantization_success",
                                "content_html": html,
                                "attachment_base64": None,
                                "error_message": None if ok else "SMTP Error",
                                "sent_at": datetime.utcnow(),
                            })
            except Exception as email_err:
                print(f"Failed to process quantization success email: {email_err}")

        except Exception as e:
            import traceback
            if not isinstance(e, InterruptedError):
                traceback.print_exc()
            _quantization_cancelled.discard(quantization_id)
            _quantization_running.discard(quantization_id)
            _quantization_progress.pop(quantization_id, None)

            if isinstance(e, InterruptedError):
                quantization.status = QuantizationStatus.CANCELLED
                quantization.error_message = "Cancelled by user."
            else:
                quantization.status = QuantizationStatus.FAILED
                quantization.error_message = str(e)
            quantization.completed_at = datetime.utcnow()
            await quantization.save()
            print(f"Quantization {quantization_id} {'cancelled' if isinstance(e, InterruptedError) else 'failed'}: {e}")

            if isinstance(e, InterruptedError):
                return

            # --- Log failure activity ---
            try:
                from app.services.activity_service import ActivityService
                db_log = await get_database()
                workspace = await db_log.workspaces.find_one({"_id": quantization.workspace_id})
                if workspace:
                    activity_svc = ActivityService(db_log)
                    await activity_svc.log_activity(
                        workspace_id=str(quantization.workspace_id),
                        user_id=str(workspace["owner_id"]),
                        action="quantization_failed",
                        details={
                            "quantization_id": quantization_id,
                            "error": str(e)[:200],
                        },
                    )
            except Exception as log_err:
                print(f"Failed to log quantization_failed activity: {log_err}")

            # --- Send failure email ---
            try:
                db = await get_database()
                workspace = await db.workspaces.find_one({"_id": quantization.workspace_id})
                if workspace:
                    user = await db.users.find_one({"_id": workspace["owner_id"]})
                    if user and user.get("email"):
                        ns = await db.notification_settings.find_one({"user_id": user["_id"]})
                        if not ns or ns.get("optimization_failure", True):
                            ok, html = send_optimization_result_email(
                                to_email=user["email"],
                                full_name=user.get("full_name", "User"),
                                optimization_id=quantization_id,
                                workspace_id=str(workspace["_id"]),
                                status="failed",
                                error_message=str(e),
                            )
                            await db.email_logs.insert_one({
                                "user_id": user["_id"],
                                "to_email": user["email"],
                                "subject": f"CleanAI+ - Quantization Failed ({quantization_id[:8]})",
                                "status": "sent" if ok else "failed",
                                "email_type": "quantization_failure",
                                "content_html": html,
                                "attachment_base64": None,
                                "error_message": None if ok else "SMTP Error",
                                "sent_at": datetime.utcnow(),
                            })
            except Exception as email_err:
                print(f"Failed to process quantization failure email: {email_err}")

    # ------------------------------------------------------------------ #
    #  Quantization Core                                                   #
    # ------------------------------------------------------------------ #

    def _run_quantization(
        self,
        model: nn.Module,
        quantization_type: str,
        bit_width: str,
        backend: str,
        target_layer_types: list,
        per_channel: bool,
        dataset_doc,
        preprocessing_doc,
        device: torch.device,
        config: dict,
        calibration_num_samples: int,
        quantization_id: str,
        progress_callback=None,
    ) -> nn.Module:

        def _report(n: int, msg: str):
            if progress_callback:
                progress_callback(n, msg)

        # Resolve target layer types (filtered by quantization method)
        resolved_types = self._resolve_layer_types(target_layer_types, quantization_type)

        if quantization_type == "dynamic":
            _report(1, "Applying dynamic quantization…")
            dtype = torch.qint8 if bit_width == "int8" else torch.float16
            q_model = torch.quantization.quantize_dynamic(
                model.cpu(), resolved_types, dtype=dtype
            )
            return q_model

        elif quantization_type == "static":
            _report(1, "Configuring static quantization (FX Graph Mode)…")

            from torch.ao.quantization.quantize_fx import prepare_fx, convert_fx
            from torch.ao.quantization import QConfigMapping

            # Set the quantization backend engine globally
            torch.backends.quantized.engine = backend

            # Deep-copy and ensure eval + CPU before preparation
            model_cpu = copy.deepcopy(model).cpu().eval()

            # Build QConfigMapping
            if per_channel:
                qconfig = torch.ao.quantization.get_default_qconfig(backend)
            else:
                qconfig = torch.ao.quantization.QConfig(
                    activation=torch.ao.quantization.observer.MinMaxObserver.with_args(
                        dtype=torch.quint8
                    ),
                    weight=torch.ao.quantization.observer.MinMaxObserver.with_args(
                        dtype=torch.qint8
                    ),
                )
            qconfig_mapping = QConfigMapping().set_global(qconfig)

            # FX Graph Mode: automatically handles QuantStub/DeQuantStub,
            # module fusion, and functional ops like skip-connection add.
            # Needs a representative example input for tracing.
            _report(1, "Preparing model graph for quantization…")
            calibration_inputs = self._get_calibration_samples(
                dataset_doc, preprocessing_doc, torch.device("cpu"),
                config, calibration_num_samples, None, quantization_id,
                lambda msg: _report(1, msg),
            )

            example_input = calibration_inputs[0].cpu() if calibration_inputs else torch.randn(1, 3, 32, 32)

            try:
                prepared = prepare_fx(model_cpu, qconfig_mapping, example_inputs=(example_input,))
            except Exception as e:
                raise Exception(
                    f"Static quantization preparation failed: {e}. "
                    "This model architecture may not support static quantization. "
                    "Try dynamic quantization instead."
                )

            # Calibration pass
            _report(1, f"Running calibration with {len(calibration_inputs)} samples…")
            prepared.eval()
            with torch.no_grad():
                for i, sample in enumerate(calibration_inputs):
                    if quantization_id in _quantization_cancelled:
                        raise InterruptedError("Cancelled by user.")
                    try:
                        prepared(sample.cpu())
                    except Exception as cal_err:
                        print(f"Warning: Calibration sample {i} failed: {cal_err}")
                        continue

            # Convert to quantized model
            _report(1, "Converting to quantized model…")
            try:
                q_model = convert_fx(prepared)
            except Exception as e:
                raise Exception(
                    f"Static quantization conversion failed: {e}. "
                    "Try dynamic quantization or a different model."
                )

            q_model.eval()
            return q_model

        elif quantization_type == "weight_only":
            _report(1, "Applying weight-only quantization…")
            dtype = torch.qint8 if bit_width == "int8" else torch.float16
            q_model = torch.quantization.quantize_dynamic(
                model.cpu(), {nn.Linear}, dtype=dtype
            )
            return q_model

        elif quantization_type in ("float16", "bfloat16"):
            target_dtype = torch.float16 if quantization_type == "float16" else torch.bfloat16
            _report(1, f"Converting model to {quantization_type}…")
            q_model = model.to(target_dtype)
            return q_model

        else:
            raise Exception(f"Unknown quantization type: '{quantization_type}'")

    def _resolve_layer_types(self, target_layer_types: list, quantization_type: str = "dynamic") -> set:
        """Resolve string layer type names to actual PyTorch module classes.
        Filters by quantization method since not all methods support all layer types.
        - dynamic: only Linear, LSTM, GRU (torch.quantization.quantize_dynamic limitation)
        - weight_only: only Linear
        - static: all layer types supported
        """
        # Supported types per quantization method
        DYNAMIC_SUPPORTED = {nn.Linear, nn.LSTM, nn.GRU}
        WEIGHT_ONLY_SUPPORTED = {nn.Linear}
        ALL_TYPES = {nn.Linear, nn.Conv1d, nn.Conv2d, nn.Conv3d, nn.LSTM, nn.GRU, nn.Embedding}

        type_map = {
            "Linear": nn.Linear,
            "Conv1d": nn.Conv1d,
            "Conv2d": nn.Conv2d,
            "Conv3d": nn.Conv3d,
            "LSTM": nn.LSTM,
            "GRU": nn.GRU,
            "Embedding": nn.Embedding,
        }

        # Determine the maximum allowed types for this quantization method
        if quantization_type == "weight_only":
            allowed = WEIGHT_ONLY_SUPPORTED
        elif quantization_type == "dynamic":
            allowed = DYNAMIC_SUPPORTED
        else:
            allowed = ALL_TYPES

        if not target_layer_types or "all" in target_layer_types:
            return allowed

        resolved = set()
        for t in target_layer_types:
            if t in type_map and type_map[t] in allowed:
                resolved.add(type_map[t])
        return resolved if resolved else {nn.Linear}

    def _get_recommended_device(self, quantization_type: str, bit_width: str) -> str:
        """Determine recommended deployment target for the quantized model."""
        if quantization_type in ("float16", "bfloat16"):
            return "GPU (CUDA)"
        elif quantization_type == "dynamic":
            if bit_width == "int8":
                return "CPU (x86/ARM)"
            return "CPU / GPU"
        elif quantization_type == "static":
            return "CPU (x86 with FBGEMM / ARM with QNNPACK)"
        elif quantization_type == "weight_only":
            return "CPU (memory-constrained environments)"
        return "CPU / GPU"

    @staticmethod
    def _find_fusable_modules(model: nn.Module) -> list:
        """Find sequences of [Conv, BN, ReLU] or [Conv, BN] or [Linear, ReLU]
        that can be fused for static quantization.

        Scans each parent module's **direct named children** in order, so
        only genuinely adjacent sub-modules within the same container are
        proposed for fusion.  Returns list of lists of dot-path name strings
        relative to *model*.
        """
        CONV = (nn.Conv1d, nn.Conv2d, nn.Conv3d)
        BN = (nn.BatchNorm1d, nn.BatchNorm2d, nn.BatchNorm3d)

        fuse_list = []

        for parent_name, parent_mod in model.named_modules():
            children = list(parent_mod.named_children())
            i = 0
            while i < len(children):
                cname, cmod = children[i]
                full = f"{parent_name}.{cname}" if parent_name else cname

                if isinstance(cmod, CONV):
                    seq = [full]
                    # Check next sibling for BN
                    if i + 1 < len(children) and isinstance(children[i + 1][1], BN):
                        bn_full = f"{parent_name}.{children[i+1][0]}" if parent_name else children[i+1][0]
                        seq.append(bn_full)
                        # Check sibling after BN for ReLU
                        if i + 2 < len(children) and isinstance(children[i + 2][1], nn.ReLU):
                            relu_full = f"{parent_name}.{children[i+2][0]}" if parent_name else children[i+2][0]
                            seq.append(relu_full)
                    if len(seq) >= 2:
                        fuse_list.append(seq)
                        i += len(seq)
                        continue

                elif isinstance(cmod, nn.Linear):
                    if i + 1 < len(children) and isinstance(children[i + 1][1], nn.ReLU):
                        relu_full = f"{parent_name}.{children[i+1][0]}" if parent_name else children[i+1][0]
                        fuse_list.append([full, relu_full])
                        i += 2
                        continue

                i += 1

        return fuse_list

    # ------------------------------------------------------------------ #
    #  Helpers (mirrored from OptimizationService)                        #
    # ------------------------------------------------------------------ #

    def _measure_inference_time(
        self, model: nn.Module, example_input: torch.Tensor, device: torch.device
    ) -> Tuple[float, float]:
        """Measure inference time. Returns (ms_per_sample, throughput)."""
        _N_WARMUP = 10
        model.eval()
        try:
            with torch.no_grad():
                for _ in range(_N_WARMUP):
                    model(example_input)
            if device.type == "cuda":
                torch.cuda.synchronize()

            _timings = []
            for _ in range(3):
                _t0 = _time.perf_counter()
                with torch.no_grad():
                    model(example_input)
                if device.type == "cuda":
                    torch.cuda.synchronize()
                _t1 = _time.perf_counter()
                _timings.append(_t1 - _t0)

            _timings.sort()
            _elapsed = _timings[1]  # median
            ms = _elapsed * 1000
            throughput = 1.0 / max(_elapsed, 1e-9)
            return ms, throughput
        except Exception as e:
            print(f"Warning: Could not measure inference time: {e}")
            return 0.0, 0.0

    def _get_example_inputs(
        self,
        model_doc: dict,
        dataset_doc,
        preprocessing_doc,
        device: torch.device,
        config: dict,
    ) -> Tuple[torch.Tensor, int]:
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
        fallback_input,
        quantization_id: str = "",
        on_sample=None,
    ) -> List[torch.Tensor]:
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
                    if quantization_id and quantization_id in _quantization_cancelled:
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
                if len(samples) >= n or (quantization_id and quantization_id in _quantization_cancelled):
                    break

        # Pad with random fallback
        if fallback_input is not None:
            while len(samples) < n:
                samples.append(fallback_input)
                if on_sample:
                    on_sample(f"Collecting calibration samples: {len(samples)} / {n}…")
        else:
            # Generate random inputs
            while len(samples) < n:
                samples.append(torch.randn(1, 3, 224, 224).to(device))
                if on_sample:
                    on_sample(f"Collecting calibration samples: {len(samples)} / {n}…")

        return samples

    def _build_transforms(self, preprocessing_doc):
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
        file_path = model_doc["file_path"]
        fmt = model_doc.get("format", "")

        def _load_definition(namespace: str):
            def_path = model_doc.get("definition_file_path")
            if def_path and os.path.exists(def_path):
                spec = importlib.util.spec_from_file_location(namespace, def_path)
                module = importlib.util.module_from_spec(spec)
                sys.modules[namespace] = module
                spec.loader.exec_module(module)
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
            _load_definition("model_def_quant_full")
            model = torch.load(file_path, map_location=device, weights_only=False)
            if not isinstance(model, nn.Module):
                raise Exception(
                    "Loaded file is not a PyTorch nn.Module. "
                    "Ensure the model was saved with torch.save(model, path)."
                )
            model.to(device)
            return model

        elif fmt in [ModelFormat.STATE_DICT, ModelFormat.CHECKPOINT]:
            module = _load_definition("model_def_quant_sd")
            model_class = _find_module_class(module)
            if model_class is None:
                raise Exception(
                    "State dict models require a definition file (.py). "
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

            module = _load_definition("model_def_quant_st")
            model_class = _find_module_class(module)
            if model_class is None:
                raise Exception(
                    "Safetensors models require a definition file (.py)."
                )
            model = model_class()
            state = load_file(file_path)
            model.load_state_dict(state)
            model.to(device)
            return model

        else:
            raise Exception(
                f"Model format '{fmt}' is not supported for quantization. "
                "Supported formats: full_model, state_dict, checkpoint, safetensors."
            )
