from typing import List
import os
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse
from beanie import PydanticObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.services.workspace.execution_service import ExecutionService
from app.models.auth.user import User
from app.models.report import Report, ReportType
from app.models.workspace.execution import ExecutionStatus
from app.database.mongodb import get_database
from app.dependencies import get_current_user
from app.schemas.execution import ExecutionCreate, ExecutionResponse, ExecutionComparisonResponse

router = APIRouter()

def get_execution_service() -> ExecutionService:
    return ExecutionService()

@router.post("/", response_model=ExecutionResponse, status_code=status.HTTP_201_CREATED)
async def create_execution(
    workspace_id: str,
    request: ExecutionCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    service: ExecutionService = Depends(get_execution_service),
):
    execution = await service.create_execution(workspace_id, request)
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

@router.get("/{execution_id}/progress")
async def get_execution_progress(
    workspace_id: str,
    execution_id: str,
    current_user: User = Depends(get_current_user),
    service: ExecutionService = Depends(get_execution_service),
):
    """Return the live progress (0-100) of a running execution."""
    exec_obj = await service.get_execution(execution_id)
    if not exec_obj or str(exec_obj.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Execution not found")

    if exec_obj.status == ExecutionStatus.COMPLETED:
        return {"progress": 100, "status": exec_obj.status}
    if exec_obj.status == ExecutionStatus.FAILED:
        return {"progress": 0, "status": exec_obj.status}

    return {"progress": service.get_progress(execution_id), "status": exec_obj.status}

@router.post("/{execution_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_execution(
    workspace_id: str,
    execution_id: str,
    current_user: User = Depends(get_current_user),
    service: ExecutionService = Depends(get_execution_service),
):
    """Cancel a pending or running execution."""
    exec_obj = await service.get_execution(execution_id)
    if not exec_obj or str(exec_obj.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Execution not found")

    cancelled = await service.cancel_execution(execution_id)
    if not cancelled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Execution is not in a cancellable state.",
        )
    return {"message": "Cancellation requested.", "execution_id": execution_id}

@router.get("/compare", response_model=ExecutionComparisonResponse)
async def compare_executions(
    workspace_id: str,
    execution1_id: str,
    execution2_id: str,
    current_user: User = Depends(get_current_user),
    service: ExecutionService = Depends(get_execution_service),
):
    """Compare metrics between two executions."""
    comparison = await service.compare_executions(execution1_id, execution2_id)
    if not comparison:
        raise HTTPException(status_code=404, detail="One or both executions not found")
    
    # Verify both executions belong to this workspace
    if str(comparison.execution1.workspace_id) != workspace_id or str(comparison.execution2.workspace_id) != workspace_id:
        raise HTTPException(status_code=403, detail="Executions do not belong to this workspace")
    
    return comparison
