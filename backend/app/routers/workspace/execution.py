from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from app.services.workspace.execution_service import ExecutionService
from app.models.auth.user import User
from app.dependencies import get_current_user
from app.schemas.execution import ExecutionCreate, ExecutionResponse

router = APIRouter()

def get_execution_service() -> ExecutionService:
    return ExecutionService()

@router.post("/", response_model=ExecutionResponse, status_code=status.HTTP_201_CREATED)
async def create_execution(
    workspace_id: str,
    request: ExecutionCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    service: ExecutionService = Depends(get_execution_service)
):
    execution = await service.create_execution(workspace_id, request)
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
