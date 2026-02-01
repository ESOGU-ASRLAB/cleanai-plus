from typing import Optional, Dict, Any, List
from datetime import datetime
from beanie import Document
from pydantic import Field
from app.models.base import PyObjectId
from enum import Enum

class ExecutionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class Execution(Document):
    workspace_id: PyObjectId
    model_id: PyObjectId
    dataset_id: PyObjectId
    preprocessing_id: Optional[PyObjectId] = None
    
    status: ExecutionStatus = ExecutionStatus.PENDING
    config: Dict[str, Any] = {}
    metrics: Dict[str, Any] = {}
    logs: List[str] = []
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    error_message: Optional[str] = None

    class Settings:
        name = "executions"
