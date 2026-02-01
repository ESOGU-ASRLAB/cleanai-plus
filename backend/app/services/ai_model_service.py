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

