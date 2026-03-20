from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse
from app.services.workspace.optimization_service import OptimizationService
from app.models.auth.user import User
from app.models.workspace.optimization import OptimizationStatus
from app.dependencies import get_current_user
from app.schemas.optimization import OptimizationCreate, OptimizationResponse
import os

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


@router.delete("/{optimization_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_optimization(
    workspace_id: str,
    optimization_id: str,
    current_user: User = Depends(get_current_user),
    service: OptimizationService = Depends(get_optimization_service),
):
    """Delete an optimization record."""
    opt = await service.get_optimization(optimization_id)
    if not opt or str(opt.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Optimization not found")

    deleted = await service.delete_optimization(optimization_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Could not delete optimization.")


@router.get("/{optimization_id}/progress")
async def get_optimization_progress(
    workspace_id: str,
    optimization_id: str,
    current_user: User = Depends(get_current_user),
    service: OptimizationService = Depends(get_optimization_service),
):
    """Return the live progress (0-100) and current stage message for a running optimization."""
    opt = await service.get_optimization(optimization_id)
    if not opt or str(opt.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Optimization not found")

    if opt.status == OptimizationStatus.COMPLETED:
        return {"progress": 100, "message": "Completed", "status": opt.status}
    if opt.status in (OptimizationStatus.FAILED, OptimizationStatus.CANCELLED):
        return {"progress": 0, "message": opt.error_message or str(opt.status), "status": opt.status}

    info = service.get_progress(optimization_id)
    return {"progress": info.get("progress", 0), "message": info.get("message", ""), "status": opt.status}


@router.get("/{optimization_id}/report")
async def download_optimization_report(
    workspace_id: str,
    optimization_id: str,
    current_user: User = Depends(get_current_user),
):
    """Download the PDF report for a completed optimization."""
    from beanie import PydanticObjectId
    from app.models.report import Report, ReportType

    try:
        oid = PydanticObjectId(optimization_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid optimization ID")

    report = await Report.find_one(
        Report.reference_id == oid,
        Report.reference_type == ReportType.OPTIMIZATION,
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not os.path.exists(report.file_path):
        raise HTTPException(status_code=404, detail="Report file not found on disk")

    return FileResponse(
        path=report.file_path,
        filename=os.path.basename(report.file_path),
        media_type="application/pdf",
    )
