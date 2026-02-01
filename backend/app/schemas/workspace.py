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
    preprocessing: Optional[PreprocessingDefinition] = None


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    preprocessing: Optional[PreprocessingDefinition] = None
    owner_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
