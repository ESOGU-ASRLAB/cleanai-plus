from typing import List
import os
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from beanie import PydanticObjectId
from app.services.workspace.execution_service import ExecutionService
from app.services.activity_service import ActivityService
from app.models.auth.user import User
from app.models.report import Report, ReportType
from app.models.dataset.dataset import Dataset
from app.models.workspace.preprocessing import Preprocessing
from app.database.mongodb import get_database
from app.dependencies import get_current_user
from app.schemas.execution import ExecutionCreate, ExecutionResponse

router = APIRouter()

def get_execution_service() -> ExecutionService:
    return ExecutionService()

def get_activity_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> ActivityService:
    return ActivityService(db)

@router.post("/", response_model=ExecutionResponse, status_code=status.HTTP_201_CREATED)
async def create_execution(
    workspace_id: str,
    request: ExecutionCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    service: ExecutionService = Depends(get_execution_service),
    activity_service: ActivityService = Depends(get_activity_service),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    execution = await service.create_execution(workspace_id, request)
    
    # Fetch details for logging
    try:
        model_name = "Unknown Model"
        dataset_name = "Unknown Dataset"
        preprocessing_name = "None"

        # Model (using Motor directly as in other services)
        if request.model_id:
            model_doc = await db.ai_models.find_one({"_id": ObjectId(request.model_id)})
            if model_doc:
                model_name = model_doc.get("name", "Unknown Model")

        # Dataset (Beanie)
        if request.dataset_id:
            dataset_doc = await Dataset.get(PydanticObjectId(request.dataset_id))
            if dataset_doc:
                dataset_name = dataset_doc.name

        # Preprocessing (Beanie)
        if request.preprocessing_id:
            prep_doc = await Preprocessing.get(PydanticObjectId(request.preprocessing_id))
            if prep_doc:
                preprocessing_name = prep_doc.name
        
        await activity_service.log_activity(
            workspace_id=workspace_id,
            user_id=str(current_user.id),
            action="execution_started",
            details={
                "execution_id": str(execution.id),
                "model_name": model_name,
                "dataset_name": dataset_name,
                "preprocessing_name": preprocessing_name
            }
        )
    except Exception as e:
        print(f"Failed to log activity: {e}")

    # Start execution in background
    background_tasks.add_task(service.run_execution, str(execution.id))
    return execution

@router.get("/", response_model=List[ExecutionResponse])
async def list_executions(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    service: ExecutionService = Depends(get_execution_service)
):
    return await service.get_executions(workspace_id)

@router.get("/{execution_id}/report")
async def get_execution_report(
    workspace_id: str,
    execution_id: str,
    current_user: User = Depends(get_current_user)
):
    report = await Report.find_one(
        Report.reference_id == PydanticObjectId(execution_id),
        Report.reference_type == ReportType.EXECUTION
    )
    if not report or not os.path.exists(report.file_path):
        raise HTTPException(status_code=404, detail="Report not found")
    
    return FileResponse(
        path=report.file_path, 
        filename=os.path.basename(report.file_path),
        media_type='application/pdf'
    )
