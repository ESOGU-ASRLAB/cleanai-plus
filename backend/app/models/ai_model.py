from enum import Enum
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field
from bson import ObjectId
from app.models.base import PyObjectId

class ModelFormat(str, Enum):
    STATE_DICT = "state_dict"
    FULL_MODEL = "full_model"
    TORCHSCRIPT = "torchscript"
    SAFETENSORS = "safetensors"
    CHECKPOINT = "checkpoint"
    ONNX = "onnx"

class AIModelBase(BaseModel):
    name: str
    description: Optional[str] = None
    format: ModelFormat
    version: str = "1.0.0"

class AIModelCreate(AIModelBase):
    pass

class AIModelInDB(AIModelBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    workspace_id: PyObjectId
    owner_id: PyObjectId
    file_path: str
    file_size_bytes: int
    definition_file_path: Optional[str] = None
    is_optimized: bool = False
    optimization_type: Optional[str] = None
    quantization_backend: Optional[str] = None
    is_favorite: bool = False
    original_model_id: Optional[PyObjectId] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
