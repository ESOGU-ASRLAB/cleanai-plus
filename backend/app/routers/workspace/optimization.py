from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from app.services.workspace.optimization_service import OptimizationService
from app.models.auth.user import User
from app.models.workspace.optimization import OptimizationStatus
from app.dependencies import get_current_user
from app.schemas.optimization import OptimizationCreate, OptimizationResponse

router = APIRouter()


def get_optimization_service() -> OptimizationService:
    return OptimizationService()


@router.get("/model-layers/{model_id}")
async def get_model_layers(
    workspace_id: str,
    model_id: str,
    current_user: User = Depends(get_current_user),
    service: OptimizationService = Depends(get_optimization_service),
):
    """Return the named prunable layers of a PyTorch model for use in ignored_layers selection."""
    try:
        layers = await service.get_model_layers(workspace_id, model_id)
        return {"layers": layers}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/", response_model=OptimizationResponse, status_code=status.HTTP_201_CREATED)
async def create_optimization(
    workspace_id: str,
    request: OptimizationCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    service: OptimizationService = Depends(get_optimization_service),
):
    """Create and start a network optimization (pruning) job."""
    optimization = await service.create_optimization(workspace_id, request)
    background_tasks.add_task(service.run_optimization, str(optimization.id))
    return optimization


@router.get("/", response_model=List[OptimizationResponse])
async def list_optimizations(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    service: OptimizationService = Depends(get_optimization_service),
):
    """List all optimizations for a workspace."""
    return await service.get_optimizations(workspace_id)


@router.get("/{optimization_id}", response_model=OptimizationResponse)
async def get_optimization(
    workspace_id: str,
    optimization_id: str,
    current_user: User = Depends(get_current_user),
    service: OptimizationService = Depends(get_optimization_service),
):
    """Get details of a specific optimization job."""
    opt = await service.get_optimization(optimization_id)
    if not opt or str(opt.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Optimization not found")
    return opt


@router.post("/{optimization_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_optimization(
    workspace_id: str,
    optimization_id: str,
    current_user: User = Depends(get_current_user),
    service: OptimizationService = Depends(get_optimization_service),
):
    """Cancel a pending or running optimization job."""
    opt = await service.get_optimization(optimization_id)
    if not opt or str(opt.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Optimization not found")

    cancelled = await service.cancel_optimization(optimization_id)
    if not cancelled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Optimization is not in a cancellable state.",
        )
    return {"message": "Cancellation requested.", "optimization_id": optimization_id}
