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
from app.models.ai_model import ModelFormat
from app.schemas.execution import ExecutionCreate
from app.database.mongodb import get_database

# PyTorch Imports (Delayed to avoid startup overhead if not used, but good for type check)
import torch
import torch.nn as nn
from torchvision import transforms
from PIL import Image

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
            model = self._load_model_from_disk(model_doc, device)
            model.eval()

            # 4. Prepare Data Loader & Inference Loop
            dataset_root = dataset_doc.path

            # Use Preprocessing if defined, else Default
            # TODO: Integrate Preprocessing model. For now, hardcode ResNet defaults or basic
            preprocess = transforms.Compose([
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]) # ImageNet defaults
            ])
            
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
                            target = torch.tensor([class_to_idx[label_name]]).to(device)
                            loss = criterion(outputs, target)
                            loss_sum += loss.item()
                            
                            if predicted.item() == target.item():
                                correct += 1
                        
                        total += 1
                        processed_count += 1
                        
                    except Exception as img_err:
                        print(f"Error processing sample {sample_id}: {img_err}")
            
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

        except Exception as e:
            print(f"Execution failed: {str(e)}")
            execution.status = ExecutionStatus.FAILED
            execution.error_message = str(e)
            execution.completed_at = datetime.utcnow()
            await execution.save()

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

    def _load_model_from_disk(self, model_doc: dict, device: torch.device) -> nn.Module:
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
                    model.fc = nn.Linear(model.fc.in_features, 10) # Assume CIFAR-10
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
            
        else:
             raise Exception(f"Model format {fmt} not supported yet in this runner.")


    async def get_executions(self, workspace_id: str) -> List[Execution]:
        return await Execution.find(Execution.workspace_id == PydanticObjectId(workspace_id)).sort(-Execution.created_at).to_list()

    async def get_execution(self, execution_id: str) -> Optional[Execution]:
        return await Execution.get(PydanticObjectId(execution_id))
