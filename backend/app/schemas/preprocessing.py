from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
from beanie import PydanticObjectId

class PreprocessingCreate(BaseModel):
    name: str
    description: Optional[str] = None
    mode: str = "ui"
    code: Optional[str] = None
    steps: Optional[List[Dict[str, Any]]] = None

class PreprocessingUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    mode: Optional[str] = None
    code: Optional[str] = None
    steps: Optional[List[Dict[str, Any]]] = None

class PreprocessingResponse(BaseModel):
    id: PydanticObjectId
    workspace_id: PydanticObjectId
    name: str
    description: Optional[str] = None
    mode: str
    code: Optional[str] = None
    steps: Optional[List[Dict[str, Any]]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {PydanticObjectId: str}
