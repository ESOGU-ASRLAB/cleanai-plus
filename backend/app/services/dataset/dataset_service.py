import os
import shutil
import pickle
import numpy as np
from PIL import Image
from typing import List, Optional, Set, Dict, Any
from fastapi import UploadFile
from beanie import PydanticObjectId
from app.models.dataset.dataset import Dataset
from app.config import settings

class DatasetService:
    @staticmethod
    async def list_datasets(workspace_id: PydanticObjectId) -> List[Dataset]:
        return await Dataset.find(Dataset.workspace_id == workspace_id).to_list()

    @staticmethod
    async def create_dataset(
        workspace_id: PydanticObjectId,
        name: str,
        type: str,
        files: List[UploadFile],
        description: Optional[str] = None,
        paths: Optional[List[str]] = None, # Parallel list to files, storing relative paths
        schema_info: Optional[dict] = None
    ) -> Dataset:
        # 1. Create DB entry
        dataset = Dataset(
            workspace_id=workspace_id,
            name=name,
            description=description,
            type=type,
            path="", # Will update
            file_count=len(files),
            size_bytes=0, # Will update
            schema_info=schema_info
        )
        
        # 2. Setup Storage Path
        # e.g., uploads/workspaces/{ws_id}/datasets/{ds_id}
        base_path = f"uploads/workspaces/{workspace_id}/datasets"
        
        # We need an ID for the folder, but document isn't saved yet if we want ID first.
        # Beanie assigns ID on insert. We can insert first.
        await dataset.insert()
        
        dataset_path = os.path.join(base_path, str(dataset.id))
        os.makedirs(dataset_path, exist_ok=True)
        dataset.path = dataset_path
        
        total_size = 0
        detected_classes = set()
        samples = []
        saved_file_paths = []

        # 3. Save Files
        # If paths is provided, use it to reconstruct structure
        # paths[i] corresponds to files[i]
        
        for i, file in enumerate(files):
            file_content = await file.read()
            size = len(file_content)
            total_size += size
            
            # Determine save path
            if paths and i < len(paths) and paths[i] and paths[i] != "undefined":
                # User provided a relative path (e.g., classA/img.jpg)
                rel_path = paths[i]
                # Security check: prevent directory traversal
                rel_path = rel_path.lstrip("/").lstrip("\\").replace("..", "")
                
                # If image classification, the first folder is often the class
                parts = rel_path.split("/")
                if len(parts) > 1:
                    detected_classes.add(parts[0])
                
                full_save_path = os.path.join(dataset_path, rel_path)
                os.makedirs(os.path.dirname(full_save_path), exist_ok=True)
                
                # Collect sample
                if len(samples) < 5 and file.content_type.startswith("image/"):
                     # Store path relative to 'uploads' directory for serving
                     # dataset_path is 'uploads/workspaces/...'
                     # We want 'workspaces/...' part if we mount 'uploads'
                     # OR just store the full relative path 'uploads/...' and let frontend handle it
                     
                     # Let's store the full path relative to the project root (starting with uploads/)
                     # Frontend can assume API_URL + "/" + path
                     sample_full_path = os.path.join(dataset_path, rel_path).replace("\\", "/")
                     samples.append(sample_full_path)
                
                saved_file_paths.append(full_save_path)

            else:
                # Flat save
                full_save_path = os.path.join(dataset_path, file.filename)
                
                # Collect sample (flat)
                if len(samples) < 5 and file.content_type.startswith("image/"):
                     sample_full_path = os.path.join(dataset_path, file.filename).replace("\\", "/")
                     samples.append(sample_full_path)
                
                saved_file_paths.append(full_save_path)
            
            with open(full_save_path, "wb") as f:
                f.write(file_content)
            
            # Reset cursor if needed elsewhere (not needed here as we read bytes)
        
        # 4. Special Processing for Pickle Batch (CIFAR, Generic)
        if type == "pickle_batch":
            pickle_info = DatasetService._process_generic_pickle(dataset_path, saved_file_paths)
            if pickle_info['success']:
                if pickle_info['classes']:
                     detected_classes.update(pickle_info['classes'])
                if pickle_info['samples']:
                     samples.extend(pickle_info['samples'])
                # If successfully processed into images, update type capability
                dataset.type = "image_classification" 

        dataset.size_bytes = total_size
        if detected_classes:
            # Sort classes alphabetically to ensure deterministic order (matching standard ImageFolder behavior)
            # This order is saved to DB and serves as the ground truth for Label <-> Index mapping.
            dataset.classes = sorted(list(detected_classes))
        
        # Override with schema_info if provided (user explicit mapping)
        if schema_info and "classes" in schema_info:
             dataset.classes = schema_info["classes"]
        
        dataset.samples = samples[:5] # Ensure max 5
            
        await dataset.save()
        
        return dataset

    @staticmethod
    def _process_generic_pickle(dataset_path: str, file_paths: List[str]) -> Dict[str, Any]:
        """
        Extracts images from generic python pickle batch files.
        Supports CIFAR-10, CIFAR-100, and generic dicts with 'data'/'features' and 'labels'.
        """
        detected_classes = set()
        samples = []
        is_processed = False
        
        # Map integer labels to string names if metadata exists
        label_map = {} 
        
        # 1. Try to find metadata (supporting CIFAR-10, CIFAR-100 styles)
        # CIFAR-10: features: label_names
        # CIFAR-100: features: fine_label_names, coarse_label_names
        
        for path in file_paths:
            fname = os.path.basename(path).lower()
            if 'meta' in fname:
                try:
                    with open(path, 'rb') as f:
                        data = pickle.load(f, encoding='bytes')
                        
                        def decode_list(l):
                            return [x.decode('utf-8') if isinstance(x, bytes) else str(x) for x in l]

                        if b'label_names' in data: # CIFAR-10
                            names = decode_list(data[b'label_names'])
                            for idx, name in enumerate(names):
                                label_map[idx] = name
                        
                        elif b'fine_label_names' in data: # CIFAR-100
                            names = decode_list(data[b'fine_label_names'])
                            for idx, name in enumerate(names):
                                label_map[idx] = name
                                
                except Exception as e:
                    print(f"Error reading metadata {fname}: {e}")

        # 2. Process data batches
        for path in file_paths:
            fname = os.path.basename(path).lower()
            # Skip explicit meta files or obvious non-data
            if 'meta' in fname or fname.endswith('.html') or fname.endswith('.txt'):
                continue

            try:
                with open(path, 'rb') as f:
                    batch = pickle.load(f, encoding='bytes')
                    
                    if not isinstance(batch, dict):
                        continue

                    # Identify Data Key
                    keys = list(batch.keys())
                    
                    # Helper to find key byte or string
                    def find_key(candidates):
                        for k in keys:
                            if isinstance(k, bytes):
                                if k in [c.encode('utf-8') for c in candidates]: return k
                            elif isinstance(k, str):
                                if k in candidates: return k
                        return None
                    
                    data_key = find_key(['data', 'features', 'images'])
                    labels_key = find_key(['labels', 'fine_labels', 'targets'])
                    filenames_key = find_key(['filenames'])
                    
                    if data_key and labels_key:
                        features = batch[data_key]
                        labels = batch[labels_key]
                        filenames = batch.get(filenames_key, [])
                        
                        if hasattr(features, 'shape') and hasattr(features, 'reshape'):
                            N = len(features)
                            
                            # Heuristic Reshape Logic
                            # Handle flattened arrays
                            if len(features.shape) == 2: 
                                D = features.shape[1]
                                if D == 3072: # 32x32x3 (CIFAR) - NCHW
                                    features = features.reshape((N, 3, 32, 32)).transpose(0, 2, 3, 1)
                                elif D == 784: # 28x28 (MNIST) - HW
                                    features = features.reshape((N, 28, 28))
                                # Add more heuristics here if needed (e.g. 1D arrays)
                            
                            # Valid Image Shapes: (N, H, W, C) or (N, H, W)
                            if len(features.shape) >= 3:
                                is_processed = True
                                
                                for i in range(min(len(features), len(labels))):
                                    label_idx = labels[i]
                                    
                                    # Resolve Label Name
                                    label_name = label_map.get(label_idx, str(label_idx))
                                    detected_classes.add(label_name)
                                    
                                    # Create Class Folder
                                    class_dir = os.path.join(dataset_path, label_name)
                                    os.makedirs(class_dir, exist_ok=True)
                                    
                                    # Resolve Filename
                                    if filenames and i < len(filenames):
                                        f_name = filenames[i]
                                        if isinstance(f_name, bytes):
                                            f_name = f_name.decode('utf-8')
                                    else:
                                        f_name = f"{fname}_{i}.png"
                                    
                                    save_path = os.path.join(class_dir, f_name)
                                    
                                    # Write Image
                                    # Ensure uint8
                                    img_data = features[i]
                                    if img_data.dtype != np.uint8:
                                         img_data = img_data.astype(np.uint8)
                                         
                                    img = Image.fromarray(img_data)
                                    img.save(save_path)
                                    
                                    # Add to samples
                                    if len(samples) < 5:
                                        rel_path = os.path.join(label_name, f_name).replace("\\", "/")
                                         # Store absolute relative path from project root/uploads if needed or just relative to dataset
                                        full_path = os.path.join(dataset_path, rel_path).replace("\\", "/")
                                        samples.append(full_path)
            
            except Exception as e:
                print(f"Error processing pickle {fname}: {e}")
                    
        return {"classes": list(detected_classes), "samples": samples, "success": is_processed}

