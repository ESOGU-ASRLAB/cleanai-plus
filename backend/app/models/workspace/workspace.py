from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from bson import ObjectId
from app.models.auth.user import PyObjectId


class PreprocessingDefinition(BaseModel):
    mode: str = "ui"  # "ui" or "code"
    code: Optional[str] = ""
    steps: Optional[list] = []


class WorkspaceBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    is_public: bool = False
    preprocessing: Optional[PreprocessingDefinition] = Field(default_factory=PreprocessingDefinition)


class WorkspaceCreate(WorkspaceBase):
    pass


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    is_public: Optional[bool] = None
    preprocessing: Optional[PreprocessingDefinition] = None


class WorkspaceInDB(WorkspaceBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    owner_id: PyObjectId
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}


class Workspace(WorkspaceBase):
    id: str = Field(alias="_id")
    owner_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}
