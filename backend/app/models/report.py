from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from beanie import Document, PydanticObjectId
from enum import Enum

class ReportType(str, Enum):
    EXECUTION = "execution"
    DATASET = "dataset"
    MODEL = "model"
    # Future types can be added here

class Report(Document):
    workspace_id: PydanticObjectId
    reference_id: PydanticObjectId # The ID of the object this report is about (e.g., execution_id)
    reference_type: ReportType
    name: str # e.g., "Execution Report - #123"
    file_path: str # Path to the generated PDF file on disk
    created_by: Optional[PydanticObjectId] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = {} # Extra info generated during report creation

    class Settings:
        name = "reports"
