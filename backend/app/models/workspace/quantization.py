from typing import Optional, Dict, Any
from datetime import datetime
from beanie import Document
from pydantic import Field
from app.models.base import PyObjectId
from enum import Enum


class QuantizationStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Quantization(Document):
    model_config = {'protected_namespaces': ()}
    workspace_id: PyObjectId
    model_id: PyObjectId
    dataset_id: Optional[PyObjectId] = None
    preprocessing_id: Optional[PyObjectId] = None

    status: QuantizationStatus = QuantizationStatus.PENDING
    config: Dict[str, Any] = {}
    result: Dict[str, Any] = {}

    output_model_id: Optional[PyObjectId] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    error_message: Optional[str] = None

    class Settings:
        name = "quantizations"
