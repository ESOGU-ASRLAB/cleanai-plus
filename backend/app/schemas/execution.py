from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.workspace.execution import ExecutionStatus
from app.models.base import PyObjectId

class ExecutionCreate(BaseModel):
    model_config = {'protected_namespaces': ()}
    model_id: str
    dataset_id: str
    preprocessing_id: Optional[str] = None
    config: Dict[str, Any] = {}

class ExecutionResponse(BaseModel):
    model_config = {
        "protected_namespaces": (),
        "from_attributes": True,
        "populate_by_name": True
    }
    id: PyObjectId
    workspace_id: PyObjectId
    model_id: PyObjectId
    dataset_id: PyObjectId
    preprocessing_id: Optional[PyObjectId] = None
    status: ExecutionStatus
    config: Dict[str, Any]
    metrics: Dict[str, Any]
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None


