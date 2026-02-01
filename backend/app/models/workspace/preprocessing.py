from typing import Optional, List, Dict, Any
from beanie import Document, PydanticObjectId
from datetime import datetime
from pydantic import Field

class Preprocessing(Document):
    workspace_id: PydanticObjectId
    name: str = "Default Preprocessing"
    description: Optional[str] = None
    mode: str = "ui"  # "ui" or "code"
    code: Optional[str] = ""
    steps: Optional[List[Dict[str, Any]]] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "preprocessing"
