from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse
from app.services.workspace.quantization_service import QuantizationService
from app.models.auth.user import User
from app.models.workspace.quantization import QuantizationStatus
from app.dependencies import get_current_user
from app.schemas.quantization import QuantizationCreate, QuantizationResponse
import os

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


@router.delete("/{quantization_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quantization(
    workspace_id: str,
    quantization_id: str,
    current_user: User = Depends(get_current_user),
    service: QuantizationService = Depends(get_quantization_service),
):
    """Delete a quantization record."""
    quant = await service.get_quantization(quantization_id)
    if not quant or str(quant.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Quantization not found")

    deleted = await service.delete_quantization(quantization_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Could not delete quantization.")


@router.get("/{quantization_id}/progress")
async def get_quantization_progress(
    workspace_id: str,
    quantization_id: str,
    current_user: User = Depends(get_current_user),
    service: QuantizationService = Depends(get_quantization_service),
):
    """Return the live progress (0-100) and current stage message for a running quantization."""
    quant = await service.get_quantization(quantization_id)
    if not quant or str(quant.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Quantization not found")

    if quant.status == QuantizationStatus.COMPLETED:
        return {"progress": 100, "message": "Completed", "status": quant.status}
    if quant.status in (QuantizationStatus.FAILED, QuantizationStatus.CANCELLED):
        return {"progress": 0, "message": quant.error_message or str(quant.status), "status": quant.status}

    info = service.get_progress(quantization_id)
    return {"progress": info.get("progress", 0), "message": info.get("message", ""), "status": quant.status}


@router.get("/{quantization_id}/report")
async def download_quantization_report(
    workspace_id: str,
    quantization_id: str,
    current_user: User = Depends(get_current_user),
):
    """Download the PDF report for a completed quantization."""
    from beanie import PydanticObjectId
    from app.models.report import Report, ReportType

    try:
        oid = PydanticObjectId(quantization_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid quantization ID")

    report = await Report.find_one(
        Report.reference_id == oid,
        Report.reference_type == ReportType.QUANTIZATION,
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
