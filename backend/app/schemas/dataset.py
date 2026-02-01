from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from beanie import PydanticObjectId

class DatasetBase(BaseModel):
    name: str
    description: Optional[str] = None
    type: str  # image_classification, object_detection, text, tabular, etc.

class DatasetCreate(DatasetBase):
    schema_info: Optional[dict] = None

class DatasetResponse(DatasetBase):
    id: PydanticObjectId = Field(alias="_id")
    workspace_id: PydanticObjectId
    created_at: datetime
    file_count: int
    size_bytes: int
    classes: Optional[List[str]] = None
    samples: List[str] = []
    schema_info: Optional[dict] = None
    
    model_config = {
        "populate_by_name": True,
        "from_attributes": True
    }

