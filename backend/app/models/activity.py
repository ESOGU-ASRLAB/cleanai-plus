from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from app.models.base import PyObjectId

class ActivityLog(BaseModel):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    workspace_id: PyObjectId
    user_id: PyObjectId
    action: str
    details: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {PyObjectId: str}
