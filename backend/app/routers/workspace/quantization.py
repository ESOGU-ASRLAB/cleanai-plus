from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from app.services.workspace.quantization_service import QuantizationService
from app.models.auth.user import User
from app.models.workspace.quantization import QuantizationStatus
from app.dependencies import get_current_user
from app.schemas.quantization import QuantizationCreate, QuantizationResponse

router = APIRouter()


def get_quantization_service() -> QuantizationService:
    return QuantizationService()


@router.post("/", response_model=QuantizationResponse, status_code=status.HTTP_201_CREATED)
async def create_quantization(
    workspace_id: str,
    request: QuantizationCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    service: QuantizationService = Depends(get_quantization_service),
):
    """Create and start a quantization job."""
    quantization = await service.create_quantization(workspace_id, request)
    background_tasks.add_task(service.run_quantization, str(quantization.id))
    return quantization


@router.get("/", response_model=List[QuantizationResponse])
async def list_quantizations(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    service: QuantizationService = Depends(get_quantization_service),
):
    """List all quantizations for a workspace."""
    return await service.get_quantizations(workspace_id)


@router.get("/{quantization_id}", response_model=QuantizationResponse)
async def get_quantization(
    workspace_id: str,
    quantization_id: str,
    current_user: User = Depends(get_current_user),
    service: QuantizationService = Depends(get_quantization_service),
):
    """Get details of a specific quantization job."""
    quant = await service.get_quantization(quantization_id)
    if not quant or str(quant.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Quantization not found")
    return quant


@router.post("/{quantization_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_quantization(
    workspace_id: str,
    quantization_id: str,
    current_user: User = Depends(get_current_user),
    service: QuantizationService = Depends(get_quantization_service),
):
    """Cancel a pending or running quantization job."""
    quant = await service.get_quantization(quantization_id)
    if not quant or str(quant.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Quantization not found")

    cancelled = await service.cancel_quantization(quantization_id)
    if not cancelled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Quantization is not in a cancellable state.",
        )
    return {"message": "Cancellation requested.", "quantization_id": quantization_id}


@router.get("/{quantization_id}/progress")
async def get_quantization_progress(
    workspace_id: str,
    quantization_id: str,
    current_user: User = Depends(get_current_user),
    service: QuantizationService = Depends(get_quantization_service),
):
    """Return the live progress for a running quantization."""
    quant = await service.get_quantization(quantization_id)
    if not quant or str(quant.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Quantization not found")
    
    progress_info = service.get_progress(quantization_id)
    return {
        "status": quant.status,
        "progress": progress_info.get("progress", 0),
        "message": progress_info.get("message", ""),
    }
