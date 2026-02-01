from typing import Optional, List
from beanie import Document, PydanticObjectId
from datetime import datetime
from pydantic import Field

class Dataset(Document):
    workspace_id: PydanticObjectId
    name: str
    description: Optional[str] = None
    type: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    path: str  # Storage path
    file_count: int = 0
    size_bytes: int = 0
    classes: Optional[List[str]] = None # For classification datasets
    samples: List[str] = [] # List of relative paths to sample images
    schema_info: Optional[dict] = None # Stores column info, target column for tabular data

    class Settings:
        name = "datasets"
