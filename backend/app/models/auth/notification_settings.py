from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from bson import ObjectId
from app.models.base import PyObjectId

class NotificationSettingsBase(BaseModel):
    execution_success: bool = True
    execution_failure: bool = True
    optimization_success: bool = True
    optimization_failure: bool = True
    marketing: bool = False

class NotificationSettingsUpdate(BaseModel):
    execution_success: Optional[bool] = None
    execution_failure: Optional[bool] = None
    optimization_success: Optional[bool] = None
    optimization_failure: Optional[bool] = None
    marketing: Optional[bool] = None

class NotificationSettingsInDB(NotificationSettingsBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    user_id: PyObjectId
    updated_at: datetime = Field(default_factory=datetime.utcnow)
