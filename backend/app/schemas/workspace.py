from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel


class PreprocessingDefinition(BaseModel):
    mode: str = "ui"
    code: Optional[str] = None
    steps: Optional[List[Dict[str, Any]]] = None


class WorkspaceCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    is_public: Optional[bool] = False
    preprocessing: Optional[PreprocessingDefinition] = None


class WorkspaceUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    is_public: bool = False
    preprocessing: Optional[PreprocessingDefinition] = None
    owner_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
