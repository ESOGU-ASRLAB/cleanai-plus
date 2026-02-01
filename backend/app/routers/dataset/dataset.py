import json
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from typing import List, Optional
from beanie import PydanticObjectId
from app.services.dataset.dataset_service import DatasetService
from app.models.auth.user import User
from app.dependencies import get_current_user
from app.schemas.dataset import DatasetResponse
from app.services.activity_service import ActivityService
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database.mongodb import get_database

router = APIRouter()

def get_activity_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> ActivityService:
    return ActivityService(db)

@router.post("/", response_model=DatasetResponse)
async def create_dataset(
    workspace_id: str,
    name: str = Form(...),
    type: str = Form(...),
    description: Optional[str] = Form(None),
    files: List[UploadFile] = File(...),
    paths_json: Optional[str] = Form(None), # JSON string of list of relative paths
    schema_info: Optional[str] = Form(None), # JSON string of schema
    current_user: User = Depends(get_current_user),
    activity_service: ActivityService = Depends(get_activity_service)
):
    try:
        # Verify workspace access here if logic existed
        
        # Parse paths_json if provided
        paths = []
        if paths_json:
            try:
                paths = json.loads(paths_json)
            except json.JSONDecodeError:
                raise HTTPException(status_code=422, detail="Invalid JSON for paths_json")
        
        # Parse schema_info if provided
        parsed_schema = None
        if schema_info:
             try:
                parsed_schema = json.loads(schema_info)
             except json.JSONDecodeError:
                pass # Ignore invalid schema json for now or raise error

        dataset = await DatasetService.create_dataset(
            workspace_id=PydanticObjectId(workspace_id),
            name=name,
            type=type,
            files=files,
            description=description,
            paths=paths,
            schema_info=parsed_schema
        )
        
        # Log activity
        await activity_service.log_activity(
            workspace_id=workspace_id,
            user_id=str(current_user.id),
            action="dataset_created",
            details={
                "dataset_name": dataset.name,
                "dataset_id": str(dataset.id),
                "type": dataset.type,
                "file_count": dataset.file_count
            }
        )
        
        return dataset
    except Exception as e:
        print(f"Error creating dataset: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/", response_model=List[DatasetResponse])
async def list_datasets(
    workspace_id: str,
    current_user: User = Depends(get_current_user)
):
    datasets = await DatasetService.list_datasets(PydanticObjectId(workspace_id))
    return datasets

