from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from bson import ObjectId
from app.models.base import PyObjectId

class EmailLogBase(BaseModel):
    user_id: PyObjectId
    to_email: str
    subject: str
    status: str # "sent", "failed"
    email_type: str # "execution_success", "execution_failure", "verification", "welcome"
    content_html: Optional[str] = None
    attachment_base64: Optional[str] = None
    error_message: Optional[str] = None

class EmailLogInDB(EmailLogBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    sent_at: datetime = Field(default_factory=datetime.utcnow)
