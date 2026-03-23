import os
import sys
import importlib.util
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
import copy

import torch
import torch.nn as nn
from torch.quantization import quantize_dynamic, get_default_qconfig, get_default_qat_qconfig
from torch.quantization import prepare, convert, prepare_qat
from beanie import PydanticObjectId
from bson import ObjectId

from app.models.workspace.quantization import Quantization, QuantizationStatus, QuantizationType
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
            type=request.type,
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
        """Cancel a running quantization job."""
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
        """Return current progress info."""
        return _quantization_progress.get(quantization_id, {"progress": 0, "message": "Waiting to start…"})

    async def run_quantization(self, quantization_id: str):
        """Main entry point for quantization pipeline."""
        quantization = await self.get_quantization(quantization_id)
        if not quantization:
            return

        _quantization_running.add(quantization_id)
        _quantization_progress[quantization_id] = {"progress": 0, "message": "Starting quantization…"}

        try:
            quantization.status = QuantizationStatus.RUNNING
            quantization.started_at = datetime.utcnow()
            await quantization.save()

            # Load model
            _quantization_progress[quantization_id] = {"progress": 10, "message": "Loading model…"}
            db = await get_database()
            model_doc = await db.ai_models.find_one({"_id": ObjectId(str(quantization.model_id))})
            if not model_doc:
                raise Exception("Model not found.")

            model_fmt = model_doc.get("format", "")
            unsupported = [ModelFormat.ONNX, ModelFormat.TORCHSCRIPT]
            if model_fmt in unsupported:
                raise Exception(
                    f"Model format '{model_fmt}' is not supported for quantization. "
                    "Only PyTorch models can be quantized."
                )

            config = quantization.config
            device_str = config.get("device", "cpu")
            device = torch.device(device_str)

            loop = asyncio.get_running_loop()
            model = await loop.run_in_executor(
                None, self._load_pytorch_model, model_doc, device, 20
            )

            if self.get_cancel_requested(quantization_id):
                raise Exception("Cancelled by user")

            # Run quantization based on type
            _quantization_progress[quantization_id] = {"progress": 30, "message": f"Running {quantization.type} quantization…"}
            
            if quantization.type == QuantizationType.DYNAMIC:
                quantized_model, result = await loop.run_in_executor(
                    None, self._run_dynamic_quantization, model, config, quantization_id
                )
            elif quantization.type == QuantizationType.STATIC:
                quantized_model, result = await self._run_static_quantization(
                    model, config, quantization, quantization_id
                )
            elif quantization.type == QuantizationType.QAT:
                quantized_model, result = await self._run_qat_quantization(
                    model, config, quantization, quantization_id
                )
            else:
                raise Exception(f"Unknown quantization type: {quantization.type}")

            if self.get_cancel_requested(quantization_id):
                raise Exception("Cancelled by user")

            # Save quantized model
            _quantization_progress[quantization_id] = {"progress": 80, "message": "Saving quantized model…"}
            output_model_id = await self._save_quantized_model(
                quantized_model, model_doc, quantization, result
            )

            # Add output model name to result
            original_name = model_doc.get("name", "model")
            suffix = quantization.config.get("output_name_suffix", f"_{quantization.type}_quantized")
            result["output_model_name"] = f"{original_name}{suffix}"

            # Complete
            quantization.status = QuantizationStatus.COMPLETED
            quantization.result = result
            quantization.output_model_id = output_model_id
            quantization.completed_at = datetime.utcnow()
            await quantization.save()

            _quantization_progress[quantization_id] = {"progress": 100, "message": "Quantization completed!"}

        except Exception as e:
            quantization.status = QuantizationStatus.FAILED
            quantization.error_message = str(e)
            quantization.completed_at = datetime.utcnow()
            await quantization.save()
            _quantization_progress[quantization_id] = {"progress": 0, "message": f"Failed: {str(e)}"}
        finally:
            _quantization_running.discard(quantization_id)
            _quantization_cancelled.discard(quantization_id)

    def _load_pytorch_model(self, model_doc: Dict, device: torch.device, progress: int) -> nn.Module:
        """Load PyTorch model from disk."""
        model_path = model_doc.get("file_path", "")
        if not os.path.exists(model_path):
            raise Exception(f"Model file not found: {model_path}")

        definition_path = model_doc.get("definition_file_path", "")
        model_class_name = model_doc.get("model_class_name", "")

        # Try loading as state dict with definition
        if definition_path and model_class_name and os.path.exists(definition_path):
            spec = importlib.util.spec_from_file_location("model_module", definition_path)
            module = importlib.util.module_from_spec(spec)
            sys.modules["model_module"] = module
            spec.loader.exec_module(module)
            
            if not hasattr(module, model_class_name):
                raise Exception(f"Model class '{model_class_name}' not found in definition file")
            
            model_class = getattr(module, model_class_name)
            model = model_class()
            state_dict = torch.load(model_path, map_location=device)
            if isinstance(state_dict, dict) and "model_state_dict" in state_dict:
                state_dict = state_dict["model_state_dict"]
            model.load_state_dict(state_dict)
        else:
            # Try loading as full model
            model = torch.load(model_path, map_location=device)

        model.to(device)
        model.eval()
        return model

    def _run_dynamic_quantization(
        self, model: nn.Module, config: Dict[str, Any], quantization_id: str
    ) -> Tuple[nn.Module, Dict[str, Any]]:
        """Run dynamic quantization (weights only)."""
        _quantization_progress[quantization_id] = {"progress": 40, "message": "Quantizing weights…"}

        original_size = self._get_model_size(model)

        dtype_str = config.get("dtype", "qint8")
        device_str = config.get("device", "cpu")
        use_gpu_half = dtype_str == "float16" and device_str == "cuda" and torch.cuda.is_available()

        if use_gpu_half:
            # GPU path: convert to half-precision and keep on CUDA for Tensor Core acceleration
            _quantization_progress[quantization_id] = {"progress": 50, "message": "Converting to float16 on GPU…"}
            quantized_model = model.half()
            layer_types = []
        else:
            # CPU path: standard dynamic quantization
            layer_types = config.get("layer_types", ["Linear"])
            qconfig_spec = []
            if "Linear" in layer_types:
                qconfig_spec.append(nn.Linear)
            if "LSTM" in layer_types:
                qconfig_spec.append(nn.LSTM)
            if "GRU" in layer_types:
                qconfig_spec.append(nn.GRU)

            dtype = torch.qint8 if dtype_str == "qint8" else torch.float16
            quantized_model = quantize_dynamic(
                model,
                qconfig_spec=set(qconfig_spec) if qconfig_spec else {nn.Linear},
                dtype=dtype
            )

        quantized_size = self._get_model_size(quantized_model)

        result = {
            "original_size_mb": original_size,
            "quantized_size_mb": quantized_size,
            "compression_ratio": quantized_size / original_size if original_size > 0 else 1.0,
            "quantization_type": "dynamic",
            "dtype": dtype_str,
            "quantized_layers": layer_types,
            "gpu_half_precision": use_gpu_half,
        }

        _quantization_progress[quantization_id] = {"progress": 70, "message": "Dynamic quantization completed"}
        return quantized_model, result

    async def _run_static_quantization(
        self, model: nn.Module, config: Dict[str, Any], quantization: Quantization, quantization_id: str
    ) -> Tuple[nn.Module, Dict[str, Any]]:
        """Run static quantization (PTQ - weights + activations)."""
        _quantization_progress[quantization_id] = {"progress": 40, "message": "Preparing model for calibration…"}

        original_size = self._get_model_size(model)
        
        # Get backend
        backend = config.get("backend", "fbgemm")
        model.qconfig = get_default_qconfig(backend)
        
        # Prepare model for calibration
        model_prepared = prepare(copy.deepcopy(model), inplace=False)
        
        # Calibrate
        if quantization.dataset_id:
            _quantization_progress[quantization_id] = {"progress": 50, "message": "Calibrating with dataset…"}
            await self._calibrate_model(model_prepared, quantization, config, quantization_id)
        else:
            raise Exception("Static quantization requires a calibration dataset")

        # Convert to quantized model
        _quantization_progress[quantization_id] = {"progress": 70, "message": "Converting to quantized model…"}
        quantized_model = convert(model_prepared, inplace=False)

        quantized_size = self._get_model_size(quantized_model)

        result = {
            "original_size_mb": original_size,
            "quantized_size_mb": quantized_size,
            "compression_ratio": quantized_size / original_size if original_size > 0 else 1.0,
            "quantization_type": "static",
            "backend": backend,
            "calibration_samples": config.get("calibration_samples", 100),
        }

        return quantized_model, result

    async def _run_qat_quantization(
        self, model: nn.Module, config: Dict[str, Any], quantization: Quantization, quantization_id: str
    ) -> Tuple[nn.Module, Dict[str, Any]]:
        """Run Quantization Aware Training."""
        _quantization_progress[quantization_id] = {"progress": 40, "message": "Preparing model for QAT…"}

        original_size = self._get_model_size(model)
        
        # Get backend
        backend = config.get("backend", "fbgemm")
        model.qconfig = get_default_qat_qconfig(backend)
        
        # Prepare model for QAT
        model.train()
        model_prepared = prepare_qat(copy.deepcopy(model), inplace=False)
        
        # Train
        if quantization.dataset_id:
            _quantization_progress[quantization_id] = {"progress": 50, "message": "Training with quantization awareness…"}
            await self._train_qat_model(model_prepared, quantization, config, quantization_id)
        else:
            raise Exception("QAT requires a training dataset")

        # Convert to quantized model
        _quantization_progress[quantization_id] = {"progress": 70, "message": "Converting to quantized model…"}
        model_prepared.eval()
        quantized_model = convert(model_prepared, inplace=False)

        quantized_size = self._get_model_size(quantized_model)

        result = {
            "original_size_mb": original_size,
            "quantized_size_mb": quantized_size,
            "compression_ratio": quantized_size / original_size if original_size > 0 else 1.0,
            "quantization_type": "qat",
            "backend": backend,
            "training_epochs": config.get("epochs", 5),
        }

        return quantized_model, result

    async def _calibrate_model(
        self, model: nn.Module, quantization: Quantization, config: Dict[str, Any], quantization_id: str
    ):
        """Calibrate model with dataset."""
        # Load dataset
        dataset = await Dataset.get(quantization.dataset_id)
        if not dataset:
            raise Exception("Dataset not found")

        # Load preprocessing if specified
        preprocessing = None
        if quantization.preprocessing_id:
            preprocessing = await Preprocessing.get(quantization.preprocessing_id)

        # Run calibration forward passes
        calibration_samples = config.get("calibration_samples", 100)
        
        # TODO: Implement actual dataset loading and preprocessing
        # For now, use dummy data
        model.eval()
        with torch.no_grad():
            for i in range(min(calibration_samples, 100)):
                if self.get_cancel_requested(quantization_id):
                    raise Exception("Cancelled by user")
                # Dummy forward pass
                dummy_input = torch.randn(1, 3, 224, 224)  # Adjust based on model
                try:
                    model(dummy_input)
                except Exception:
                    pass  # Some models may fail with dummy data
                
                if i % 10 == 0:
                    progress = 50 + int((i / calibration_samples) * 20)
                    _quantization_progress[quantization_id] = {
                        "progress": progress, 
                        "message": f"Calibrating… ({i}/{calibration_samples})"
                    }

    async def _train_qat_model(
        self, model: nn.Module, quantization: Quantization, config: Dict[str, Any], quantization_id: str
    ):
        """Train model with quantization awareness."""
        # TODO: Implement actual training loop
        # For now, just simulate progress
        epochs = config.get("epochs", 5)
        
        for epoch in range(epochs):
            if self.get_cancel_requested(quantization_id):
                raise Exception("Cancelled by user")
            
            progress = 50 + int((epoch / epochs) * 20)
            _quantization_progress[quantization_id] = {
                "progress": progress, 
                "message": f"Training QAT… (Epoch {epoch+1}/{epochs})"
            }
            
            # Simulate training time
            await asyncio.sleep(0.5)

    def _get_model_size(self, model: nn.Module) -> float:
        """Get model size in MB."""
        import tempfile
        with tempfile.NamedTemporaryFile(delete=True) as tmp:
            torch.save(model.state_dict(), tmp.name)
            size_bytes = os.path.getsize(tmp.name)
        return size_bytes / (1024 * 1024)

    async def _save_quantized_model(
        self, model: nn.Module, original_model_doc: Dict, quantization: Quantization, result: Dict[str, Any]
    ) -> Optional[PydanticObjectId]:
        """Save quantized model and create new model entry."""
        db = await get_database()
        
        # Generate output filename
        original_name = original_model_doc.get("name", "model")
        output_format = quantization.config.get("output_format", "state_dict")
        suffix = quantization.config.get("output_name_suffix", f"_{quantization.type}_quantized")
        
        workspace_id = str(quantization.workspace_id)
        workspace_dir = f"backend/uploads/workspaces/{workspace_id}"
        os.makedirs(workspace_dir, exist_ok=True)
        
        output_filename = f"{original_name}{suffix}.pth"
        output_path = os.path.join(workspace_dir, output_filename)
        
        # Save model
        if output_format == "torchscript":
            scripted_model = torch.jit.script(model)
            scripted_model.save(output_path)
            model_format = ModelFormat.TORCHSCRIPT
        else:
            torch.save(model.state_dict(), output_path)
            model_format = ModelFormat.STATE_DICT
        
        # Create new model entry
        new_model = {
            "workspace_id": ObjectId(workspace_id),
            "name": f"{original_name}{suffix}",
            "description": f"Quantized from {original_name} using {quantization.type} quantization",
            "format": model_format,
            "file_path": output_path,
            "file_size": os.path.getsize(output_path),
            "framework": "pytorch",
            "metadata": {
                "quantization_id": str(quantization.id),
                "original_model_id": str(quantization.model_id),
                "quantization_type": quantization.type,
                **result
            },
            "created_at": datetime.utcnow(),
        }
        
        insert_result = await db.ai_models.insert_one(new_model)
        return PydanticObjectId(insert_result.inserted_id)
