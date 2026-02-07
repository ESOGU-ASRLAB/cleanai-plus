import os
import shutil
from datetime import datetime
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from fastapi import UploadFile

from app.models.ai_model import AIModelCreate, AIModelInDB, ModelFormat

UPLOAD_DIR = "uploads"

class AIModelService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.models_collection = db.ai_models
        
        # Ensure upload directory exists
        if not os.path.exists(UPLOAD_DIR):
            os.makedirs(UPLOAD_DIR)

    async def create_model(
        self, 
        name: str, 
        description: str, 
        format: ModelFormat,
        workspace_id: str, 
        owner_id: str,
        file: UploadFile,
        definition_file: Optional[UploadFile] = None
    ) -> AIModelInDB:
        """Upload model file and create database entry."""
        
        # Create user/workspace specific path
        new_model_id = ObjectId()
        
        workspace_path = os.path.join(UPLOAD_DIR, "workspaces", workspace_id, "models", str(new_model_id))
        os.makedirs(workspace_path, exist_ok=True)
        
        # Save main model file
        file_path = os.path.join(workspace_path, file.filename)
        size = 0
        with open(file_path, "wb") as buffer:
            while content := await file.read(1024 * 1024): 
                buffer.write(content)
                size += len(content)
        
        definition_file_path = None
        if definition_file:
            def_path = os.path.join(workspace_path, definition_file.filename)
            with open(def_path, "wb") as buffer:
                while content := await definition_file.read(1024 * 1024):
                    buffer.write(content)
            definition_file_path = def_path

        model_dict = {
            "_id": new_model_id,
            "name": name,
            "description": description,
            "format": format,
            "workspace_id": ObjectId(workspace_id),
            "owner_id": ObjectId(owner_id),
            "file_path": file_path,
            "file_size_bytes": size,
            "definition_file_path": definition_file_path,
            "version": "1.0.0", 
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }

        await self.models_collection.insert_one(model_dict)

        return AIModelInDB(**model_dict)

    async def get_models_by_workspace(self, workspace_id: str) -> List[AIModelInDB]:
        """Get all models in a workspace."""
        models = []
        if not ObjectId.is_valid(workspace_id):
            return []
            
        cursor = self.models_collection.find({"workspace_id": ObjectId(workspace_id)})
        async for document in cursor:
            models.append(AIModelInDB(**document))
        return models

    async def get_model_by_id(self, model_id: str) -> Optional[AIModelInDB]:
        if not ObjectId.is_valid(model_id):
            return None
        doc = await self.models_collection.find_one({"_id": ObjectId(model_id)})
        if doc:
            return AIModelInDB(**doc)
        return None

    async def get_model_definition(self, model_id: str) -> Optional[str]:
        if not ObjectId.is_valid(model_id):
            return None

        model_doc = await self.models_collection.find_one({"_id": ObjectId(model_id)})
        if not model_doc:
            return None
        
        model = AIModelInDB(**model_doc)
        if not model.definition_file_path or not os.path.exists(model.definition_file_path):
            return None
            
        try:
            with open(model.definition_file_path, "r") as f:
                return f.read()
        except Exception as e:
            print(f"Error reading definition file: {e}")
            return None

    async def update_model_definition(self, model_id: str, code: str) -> bool:
        if not ObjectId.is_valid(model_id):
            return False

        model_doc = await self.models_collection.find_one({"_id": ObjectId(model_id)})
        if not model_doc:
            return False

        model = AIModelInDB(**model_doc)
        if not model.definition_file_path:
            return False
        
        try:
            # Create path if it doesn't exist (though it should if definition_file_path is set)
            os.makedirs(os.path.dirname(model.definition_file_path), exist_ok=True)
            
            with open(model.definition_file_path, "w") as f:
                f.write(code)
            
            # Update updated_at timestamp
            await self.models_collection.update_one(
                {"_id": ObjectId(model_id)},
                {"$set": {"updated_at": datetime.utcnow()}}
            )
            return True
        except Exception as e:
            print(f"Error updating definition file: {e}")
            return False

    async def get_model_structure(self, model_id: str) -> Optional[List[dict]]:
        if not ObjectId.is_valid(model_id):
            return None

        model_doc = await self.models_collection.find_one({"_id": ObjectId(model_id)})
        if not model_doc:
            return None

        model = AIModelInDB(**model_doc)
        if not os.path.exists(model.file_path):
            return None

        def _inspect():
            import torch
            import sys
            import importlib.util
            
            # Helper to try to load definition if we suspect missing class
            def try_load_definition():
                if model.definition_file_path and os.path.exists(model.definition_file_path):
                    try:
                        def_dir = os.path.dirname(model.definition_file_path)
                        if def_dir not in sys.path:
                            sys.path.append(def_dir)
                            
                        module_name = os.path.splitext(os.path.basename(model.definition_file_path))[0]
                        spec = importlib.util.spec_from_file_location(module_name, model.definition_file_path)
                        if spec and spec.loader:
                            module = importlib.util.module_from_spec(spec)
                            sys.modules[module_name] = module
                            spec.loader.exec_module(module)
                            
                            # Hack: Many models are saved from __main__, so we try to inject classes into __main__
                            import __main__
                            for attr in dir(module):
                                if not attr.startswith("_"):
                                    setattr(__main__, attr, getattr(module, attr))
                    except Exception as e:
                        print(f"Warning: Failed to load definition file for model inspection: {e}")

            try:
                layers = []
                state_dict = None

                # 0. Pre-load definition if available (proactive)
                if model.format == ModelFormat.FULL_MODEL:
                    try_load_definition()

                # 1. Handle ONNX
                if model.format == ModelFormat.ONNX or model.file_path.endswith('.onnx'):
                    try:
                        # Try using the 'onnx' library first for detailed structural inspection
                        import onnx
                        
                        # Load model
                        onnx_model = onnx.load(model.file_path)
                        
                        # Attempt shape inference for better details (optional)
                        try:
                            from onnx import shape_inference
                            # Note: This might fail for large models or custom ops, safe to ignore
                            onnx_model = shape_inference.infer_shapes(onnx_model)
                        except Exception as e:
                            print(f"ONNX Shape inference warning: {e}")

                        graph = onnx_model.graph
                        
                        # Map initializers (weights) to find params
                        initializer_map = {tensor.name: tensor for tensor in graph.initializer}
                        
                        # Map value infos for shapes
                        value_info_map = {vi.name: vi for vi in graph.value_info}
                        value_info_map.update({vi.name: vi for vi in graph.input})
                        value_info_map.update({vi.name: vi for vi in graph.output})

                        def get_shape_str(proto):
                            if not proto: return "?"
                            try:
                                if not proto.type.tensor_type.HasField("shape"):
                                    return "?"
                                dims = []
                                for d in proto.type.tensor_type.shape.dim:
                                    if d.HasField('dim_value'):
                                        dims.append(d.dim_value)
                                    elif d.HasField('dim_param'):
                                        dims.append(d.dim_param)
                                    else:
                                        dims.append('?')
                                return str(dims).replace("'","")
                            except:
                                return "?"

                        for node in graph.node:
                            # Calculate parameters (weights)
                            params = 0
                            for input_name in node.input:
                                if input_name in initializer_map:
                                    tensor = initializer_map[input_name]
                                    import functools
                                    import operator
                                    if tensor.dims:
                                        p_count = functools.reduce(operator.mul, tensor.dims, 1)
                                        params += p_count
                                    else:
                                        params += 1
                                        
                            # Determine output shape (first output usually)
                            out_shape = "?"
                            if node.output:
                                # Try to find shape in value_info
                                if node.output[0] in value_info_map:
                                    out_shape = get_shape_str(value_info_map[node.output[0]])
                            
                            # Styling based on Op Type
                            color = "bg-gray-50 border-gray-200"
                            op_type = node.op_type
                            
                            if "Conv" in op_type:
                                color = "bg-blue-50 border-blue-200"
                            elif "Gemm" in op_type or "MatMul" in op_type or "Linear" in op_type:
                                color = "bg-purple-50 border-purple-200"
                            elif "Relu" in op_type or "Sigmoid" in op_type or "Tanh" in op_type:
                                color = "bg-orange-50 border-orange-200"
                            elif "Pool" in op_type:
                                color = "bg-red-50 border-red-200"
                            elif "Batch" in op_type:
                                color = "bg-green-50 border-green-200"
                            elif "Input" in op_type: # unlikely for node but just in case
                                color = "bg-gray-100 border-gray-300"
                                
                            layers.append({
                                "name": node.name if node.name else op_type,
                                "type": op_type,
                                "shape": out_shape,
                                "params": params,
                                "color": color,
                                "details": f"Inputs: {len(node.input)}, Outputs: {len(node.output)}"
                            })
                            
                        return layers

                    except ImportError:
                        print("ONNX library not installed. Falling back to onnxruntime I/O only.")
                        # Fallback to onnxruntime if 'onnx' lib missing
                        import onnxruntime as ort
                        so = ort.SessionOptions()
                        so.log_severity_level = 3
                        sess = ort.InferenceSession(model.file_path, sess_options=so)
                        
                        for input_meta in sess.get_inputs():
                            layers.append({
                                "name": input_meta.name,
                                "type": "Input",
                                "shape": str(input_meta.shape),
                                "params": 0,
                                "color": "bg-gray-100 border-gray-300",
                                "details": f"Type: {input_meta.type}"
                            })
                            
                        for output_meta in sess.get_outputs():
                            layers.append({
                                "name": output_meta.name,
                                "type": "Output",
                                "shape": str(output_meta.shape),
                                "params": 0,
                                "color": "bg-gray-100 border-gray-300",
                                "details": f"Type: {output_meta.type}"
                            })
                        return layers
                    except Exception as e:
                        print(f"ONNX inspection failed: {e}")
                        # Do not return yet, stick to trying other methods if valid

                # 2. Try Standard PyTorch Load (State Dict, Checkpoint, Full Model)
                # We try this BEFORE TorchScript because .pt can be ambiguous
                try:
                    try:
                         # PyTorch 2.6+ defaults weights_only=True
                        loaded = torch.load(model.file_path, map_location='cpu', weights_only=False)
                    except TypeError:
                        loaded = torch.load(model.file_path, map_location='cpu')
                    
                    if hasattr(loaded, "state_dict"):
                        state_dict = loaded.state_dict()
                    elif isinstance(loaded, dict) and "state_dict" in loaded:
                        state_dict = loaded["state_dict"]
                    elif isinstance(loaded, dict):
                        # Some checkpoints might be just the dict, or have 'model' key
                        if "model" in loaded:
                             # Possible lightning checkpoint or similar
                             if hasattr(loaded["model"], "state_dict"): # It is an object
                                 state_dict = loaded["model"].state_dict()
                             elif isinstance(loaded["model"], dict):
                                 state_dict = loaded["model"]
                             else:
                                 state_dict = loaded
                        else:
                            state_dict = loaded
                except Exception as e:
                    print(f"Standard torch.load failed: {e}")
                    # If this failed and it was a full model, we might have tried loading definition above.
                    # If we haven't, and it failed with attribute error, we could try again if we hadn't already.
                    pass

                # 3. Try Loading as TorchScript (JIT)
                if state_dict is None:
                     try:
                        jit_model = torch.jit.load(model.file_path)
                        state_dict = dict(jit_model.named_parameters())
                     except Exception as e:
                        # print(f"TorchScript load failed: {e}")
                        pass

                # 4. Try Safetensors
                if state_dict is None:
                    try:
                        from safetensors.torch import load_file
                        state_dict = load_file(model.file_path)
                    except Exception:
                        pass

                # Process state_dict if we found one
                if state_dict is not None:
                    for key, value in state_dict.items():
                        if not isinstance(value, torch.Tensor):
                            continue
                            
                        if "num_batches_tracked" in key:
                            continue

                        # Simple heuristic: visualize weights only to keep it clean, but fallback to all tensors
                        is_weight = key.endswith(".weight")
                        is_bias = key.endswith(".bias")
                        
                        # Decide type based on shape
                        layer_type = "Parameter"
                        color = "bg-gray-50 border-gray-200"
                        details = ""

                        if len(value.shape) == 4:
                            layer_type = "Conv2d"
                            details = f"k={value.shape[2]}x{value.shape[3]}, in={value.shape[1]}, out={value.shape[0]}"
                            color = "bg-blue-50 border-blue-200"
                        elif len(value.shape) == 2:
                            layer_type = "Linear"
                            details = f"in={value.shape[1]}, out={value.shape[0]}"
                            color = "bg-purple-50 border-purple-200"
                        elif len(value.shape) == 1:
                            if is_bias:
                                layer_type = "Bias"
                            elif "bn" in key or "batch_norm" in key:
                                layer_type = "BatchNorm" 
                                color = "bg-green-50 border-green-200"
                            else:
                                layer_type = "Parameter/1D"
                        elif len(value.shape) == 3:
                            layer_type = "Embedding/Conv1d"
                            color = "bg-yellow-50 border-yellow-200"
                        
                        # For clean visualization, we prioritize weights, but allow others if sparse
                        
                        layer_info = {
                            "name": key,
                            "original_key": key,
                            "params": value.numel(),
                            "shape": str(list(value.shape)),
                            "type": layer_type,
                            "color": color,
                            "details": details
                        }
                        
                        layers.append(layer_info)
                    
                    return layers
                return []
            except Exception as e:
                print(f"Inspection error: {e}")
                return []

        # Run in thread pool to avoid blocking main loop
        import asyncio
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _inspect)

    async def convert_model_to_onnx(self, model_id: str, user_id: str) -> Optional[AIModelInDB]:
        """
        Attempts to convert a PyTorch model to ONNX format.
        Creates a new model entry for the converted file.
        """
        if not ObjectId.is_valid(model_id):
            return None

        model_doc = await self.models_collection.find_one({"_id": ObjectId(model_id)})
        if not model_doc:
            return None
        
        source_model = AIModelInDB(**model_doc)
        
        # Can only convert PyTorch models
        if source_model.format == ModelFormat.ONNX:
            raise ValueError("Model is already in ONNX format")

        def _convert():
            import torch
            import sys
            import importlib.util
            import inspect
            import io
            
            # 1. Load Model Object (similar to inspect)
            model_obj = None
            module = None
            errors = []
            
            # Helper to load definition
            if source_model.definition_file_path and os.path.exists(source_model.definition_file_path):
                try:
                    def_dir = os.path.dirname(source_model.definition_file_path)
                    if def_dir not in sys.path:
                        sys.path.append(def_dir)
                    
                    module_name = os.path.splitext(os.path.basename(source_model.definition_file_path))[0]
                    spec = importlib.util.spec_from_file_location(module_name, source_model.definition_file_path)
                    if spec and spec.loader:
                        module = importlib.util.module_from_spec(spec)
                        sys.modules[module_name] = module
                        spec.loader.exec_module(module)
                        
                        # Inject to main
                        import __main__
                        for attr in dir(module):
                            if not attr.startswith("_"):
                                setattr(__main__, attr, getattr(module, attr))
                except Exception as e:
                    msg = f"Definition load warning: {str(e)}"
                    print(msg)
                    errors.append(msg)

            # Try loading
            torch_load_error = None
            loaded = None
            try:
                try:
                     # PyTorch 2.6+ defaults weights_only=True
                    loaded = torch.load(source_model.file_path, map_location='cpu', weights_only=False)
                except TypeError:
                    loaded = torch.load(source_model.file_path, map_location='cpu')
                
                if isinstance(loaded, torch.nn.Module):
                    model_obj = loaded
                elif hasattr(loaded, "state_dict"): # LightningModule check
                    # Currently unsupported wrapper type for direct conversion without extraction
                    pass
                
            except Exception as e:
                torch_load_error = e
                errors.append(f"torch.load failed: {str(e)}")

            if model_obj is None:
                # If loading as full object failed or returned a dict, try to reconstruct from definition
                if module:
                    candidate_classes = []
                    # Find candidates
                    for name, obj in inspect.getmembers(module):
                        if inspect.isclass(obj) and issubclass(obj, torch.nn.Module) and obj is not torch.nn.Module:
                             if obj.__module__ == module.__name__:
                                candidate_classes.append(obj)
                    
                    if not candidate_classes:
                        # Lax search
                        for name, obj in inspect.getmembers(module):
                            if inspect.isclass(obj) and issubclass(obj, torch.nn.Module) and obj is not torch.nn.Module:
                                candidate_classes.append(obj)
                    
                    state_dict_to_load = None
                    if isinstance(loaded, dict):
                         state_dict_to_load = loaded
                         if "state_dict" in loaded:
                             state_dict_to_load = loaded["state_dict"]
                         elif "model" in loaded:
                             state_dict_to_load = loaded["model"]
                    
                    # If we failed to load via torch.load (e.g. AttributeError), maybe we can load it as state_dict specific way?
                    # No, usually torch.load is generic.
                    
                    if state_dict_to_load:
                        # Fix DataParallel keys (remove "module." prefix)
                        new_state_dict = {}
                        for k, v in state_dict_to_load.items():
                            if k.startswith("module."):
                                new_state_dict[k[7:]] = v
                            else:
                                new_state_dict[k] = v
                        state_dict_to_load = new_state_dict

                        # Try to instantiate candidates
                        for cls in candidate_classes:
                            try:
                                # Try to detect constructor args
                                sig = inspect.signature(cls.__init__)
                                # Filter only required args (no default)
                                required_params = [
                                    p for p in sig.parameters.values() 
                                    if p.name != 'self' and p.default == inspect.Parameter.empty
                                ]
                                
                                if len(required_params) == 0:
                                    instance = cls()
                                else:
                                    # Fallback: try to pass dummy args? Or just skip? 
                                    # Let's try to see if we can guess from state dict? No.
                                    # Just try instantiation and fail if needed.
                                    instance = cls()

                                instance.load_state_dict(state_dict_to_load, strict=False) 
                                model_obj = instance
                                print(f"Successfully instantiated {cls.__name__} from definition")
                                errors = [] # Clear errors on success
                                break
                            except Exception as e:
                                msg = f"Failed to instantiate {cls.__name__}: {str(e)}"
                                print(msg)
                                errors.append(msg)
                    else:
                        errors.append("Loaded file is not a state_dict and no valid model object found.")

            # Try JIT as last resort
            if model_obj is None:
                try:
                     model_obj = torch.jit.load(source_model.file_path)
                except:
                    pass

            if model_obj is None:
                error_summary = "; ".join(errors)
                raise ValueError(f"Could not load model. Details: {error_summary}. Ensure Definition File is correct and matches Model File.")

            model_obj.eval()
            
            # 2. Prepare Output Path
            new_id = ObjectId()
            workspace_path = os.path.dirname(source_model.file_path)
            new_filename = f"{os.path.splitext(os.path.basename(source_model.file_path))[0]}_converted.onnx"
            new_file_path = os.path.join(workspace_path, new_filename)
            
            # 3. Export
            # Heuristic for input shape: (1, 3, 224, 224) standard for vision
            dummy_input = torch.randn(1, 3, 224, 224)
            
            try:
                torch.onnx.export(
                    model_obj, 
                    dummy_input, 
                    new_file_path, 
                    export_params=True,
                    opset_version=11,
                    do_constant_folding=True,
                    input_names=['input'],
                    output_names=['output']
                )
            except Exception as e:
                 raise ValueError(f"Export failed (Input mismatch?): {str(e)}")

            return {
                "_id": new_id,
                "path": new_file_path,
                "size": os.path.getsize(new_file_path),
                "name": f"{source_model.name} (ONNX)"
            }

        # Run conversion in thread
        import asyncio
        loop = asyncio.get_running_loop()
        try:
            result = await loop.run_in_executor(None, _convert)
            
            # Create DB entry
            new_model_dict = {
                "_id": result["_id"],
                "name": result["name"],
                "description": f"Converted from {source_model.name}",
                "format": ModelFormat.ONNX,
                "workspace_id": source_model.workspace_id,
                "owner_id": ObjectId(user_id),
                "file_path": result["path"],
                "file_size_bytes": result["size"],
                "definition_file_path": source_model.definition_file_path, # Keep reference
                "version": source_model.version, 
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            await self.models_collection.insert_one(new_model_dict)
            return AIModelInDB(**new_model_dict)

        except Exception as e:
            print(f"Conversion failed: {e}")
            raise e

