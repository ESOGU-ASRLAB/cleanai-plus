from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel
from app.models.workspace.quantization import QuantizationStatus
from app.models.base import PyObjectId


class QuantizationCreate(BaseModel):
    model_config = {'protected_namespaces': ()}
    model_id: str
    dataset_id: Optional[str] = None
    preprocessing_id: Optional[str] = None
    config: Dict[str, Any] = {}


class QuantizationResponse(BaseModel):
    model_config = {
        "protected_namespaces": (),
        "from_attributes": True,
        "populate_by_name": True,
    }
    id: PyObjectId
    workspace_id: PyObjectId
    model_id: PyObjectId
    dataset_id: Optional[PyObjectId] = None
    preprocessing_id: Optional[PyObjectId] = None
    status: QuantizationStatus
    config: Dict[str, Any]
    result: Dict[str, Any]
    output_model_id: Optional[PyObjectId] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
