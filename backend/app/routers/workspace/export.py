import asyncio
import io
import json
import re
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database.mongodb import get_database
from app.dependencies import get_current_user
from app.models.auth.user import UserInDB
from app.services.workspace.export_service import ExportService
from app.services.workspace.workspace_service import WorkspaceService

router = APIRouter()

# ── In-memory task store ─────────────────────────────────────────────────────

@dataclass
class _ExportTask:
    owner_id: str
    status: str = "running"          # running | done | error
    buf: Optional[io.BytesIO] = None
    filename: str = ""
    error: str = ""
    events: asyncio.Queue = field(default_factory=asyncio.Queue)
    created_at: float = field(default_factory=time.time)


_tasks: dict[str, _ExportTask] = {}
_TASK_TTL = 600  # seconds


def _cleanup_old_tasks() -> None:
    now = time.time()
    expired = [k for k, t in list(_tasks.items()) if now - t.created_at > _TASK_TTL]
    for k in expired:
        del _tasks[k]


def _safe_filename(name: str) -> str:
    return re.sub(r"[^\w\-.]", "_", name)


# ── Background worker ────────────────────────────────────────────────────────

async def _run_export_task(
    task_id: str,
    workspace,
    db: AsyncIOMotorDatabase,
    params: dict,
) -> None:
    task = _tasks.get(task_id)
    if not task:
        return

    async def _progress_cb(step: str, pct: int) -> None:
        await task.events.put({"step": step, "progress": pct})

    try:
        export_service = ExportService(db)
        buf = await export_service.build_export_zip(
            workspace=workspace,
            progress_callback=_progress_cb,
            **params,
        )
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        safe_name = _safe_filename(workspace.name)
        task.filename = f"workspace_{safe_name}_{timestamp}.zip"
        task.buf = buf
        task.status = "done"
        await task.events.put({"step": "Ready to download", "progress": 100, "done": True})
    except Exception as exc:
        task.status = "error"
        task.error = str(exc)
        await task.events.put({"error": str(exc), "progress": 0})
    finally:
        await task.events.put(None)  # sentinel — closes SSE stream


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/export")
async def start_export_workspace(
    workspace_id: str,
    include_preprocessings: bool = Query(default=True),
    include_executions: bool = Query(default=True),
    include_optimizations: bool = Query(default=True),
    include_quantizations: bool = Query(default=True),
    include_datasets: bool = Query(default=True),
    include_models: bool = Query(default=True),
    include_reports: bool = Query(default=True),
    include_activities: bool = Query(default=True),
    include_metrics: bool = Query(default=False),
    include_dataset_files: bool = Query(default=False),
    include_model_files: bool = Query(default=False),
    include_report_files: bool = Query(default=True),
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    _cleanup_old_tasks()

    workspace_service = WorkspaceService(db)
    workspace = await workspace_service.get_workspace_by_id(workspace_id)
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")
    if str(workspace.owner_id) != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to export this workspace.")

    task_id = secrets.token_urlsafe(16)
    task = _ExportTask(owner_id=str(current_user.id))
    _tasks[task_id] = task

    export_params = dict(
        include_preprocessings=include_preprocessings,
        include_executions=include_executions,
        include_optimizations=include_optimizations,
        include_quantizations=include_quantizations,
        include_datasets=include_datasets,
        include_models=include_models,
        include_reports=include_reports,
        include_activities=include_activities,
        include_metrics=include_metrics,
        include_dataset_files=include_dataset_files,
        include_model_files=include_model_files,
        include_report_files=include_report_files,
    )

    asyncio.create_task(_run_export_task(task_id, workspace, db, export_params))
    return {"task_id": task_id}


@router.get("/export/{task_id}/progress")
async def export_progress(
    task_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    if task.owner_id != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No permission.")

    async def _event_generator():
        while True:
            event = await task.events.get()
            if event is None:
                break
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/export/{task_id}/download")
async def download_export(
    task_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    task = _tasks.pop(task_id, None)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found or already downloaded.")
    if task.owner_id != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No permission.")
    if task.status == "error":
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=task.error)
    if task.status != "done":
        raise HTTPException(status_code=status.HTTP_202_ACCEPTED, detail="Export not ready yet.")

    return StreamingResponse(
        task.buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{task.filename}"'},
    )

