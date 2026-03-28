import asyncio
import io
import json
import os
import zipfile
from datetime import datetime, timezone
from typing import Any

from beanie import PydanticObjectId
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.ai_model import AIModelInDB
from app.models.dataset.dataset import Dataset
from app.models.report import Report
from app.models.workspace.execution import Execution
from app.models.workspace.optimization import Optimization
from app.models.workspace.preprocessing import Preprocessing
from app.models.workspace.workspace import WorkspaceInDB

UPLOAD_DIR = "uploads"

# Keys inside metrics/result dicts that are considered "heavy"
_HEAVY_METRIC_KEYS = {
    "confusion_matrix",
    "per_class_report",
    "class_report",
    "labels",
    "per_class_metrics",
    "per_label_metrics",
    "classification_report",
}


def _serialize(obj: Any) -> Any:
    """Recursively make an object JSON-serializable."""
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(i) for i in obj]
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, (PydanticObjectId, ObjectId)):
        return str(obj)
    return obj


def _strip_heavy_metrics(doc: dict) -> dict:
    """Remove heavy metric keys (confusion_matrix, labels, etc.) from a document in-place."""
    for top_key in ("metrics", "result"):
        if isinstance(doc.get(top_key), dict):
            doc[top_key] = {
                k: v
                for k, v in doc[top_key].items()
                if k not in _HEAVY_METRIC_KEYS
            }
    return doc


def _doc_to_dict(doc) -> dict:
    """Convert a Beanie / Pydantic model to a plain serializable dict."""
    raw = doc.model_dump()
    return _serialize(raw)


def _build_zip_sync(
    payload: dict,
    workspace_id: str,
    workspace_name: str,
    include_preprocessings: bool,
    include_executions: bool,
    include_optimizations: bool,
    include_datasets: bool,
    include_models: bool,
    include_reports: bool,
    include_activities: bool,
    include_metrics: bool,
    include_dataset_files: bool,
    include_model_files: bool,
    include_report_files: bool,
) -> io.BytesIO:
    """
    Pure-sync ZIP builder — runs in a thread pool so it never blocks the event loop.
    Receives already-fetched, serialized data via *payload*.
    """
    buf = io.BytesIO()
    summary: dict[str, Any] = {
        "workspace_id": workspace_id,
        "workspace_name": workspace_name,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "export_version": "1.0",
        "includes": {
            "preprocessings": include_preprocessings,
            "executions": include_executions,
            "optimizations": include_optimizations,
            "datasets": include_datasets,
            "models": include_models,
            "reports": include_reports,
            "activities": include_activities,
            "metrics": include_metrics,
            "dataset_files": include_dataset_files,
            "model_files": include_model_files,
            "report_files": include_report_files,
        },
        "counts": {},
    }

    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:

        zf.writestr("workspace.json", json.dumps(payload["workspace"], indent=2))

        # preprocessing
        if include_preprocessings:
            zf.writestr("preprocessing/metadata.json", json.dumps(payload["preprocessing"], indent=2))
            summary["counts"]["preprocessing"] = len(payload["preprocessing"])

        # executions
        if include_executions:
            zf.writestr("executions/metadata.json", json.dumps(payload["executions"], indent=2))
            summary["counts"]["executions"] = len(payload["executions"])

        # optimizations
        if include_optimizations:
            zf.writestr("optimizations/metadata.json", json.dumps(payload["optimizations"], indent=2))
            summary["counts"]["optimizations"] = len(payload["optimizations"])

        # quantizations section removed

        # activities
        if include_activities:
            zf.writestr("activities/metadata.json", json.dumps(payload["activities"], indent=2))
            summary["counts"]["activities"] = len(payload["activities"])

        # datasets
        if include_datasets:
            zf.writestr("datasets/metadata.json", json.dumps(payload["datasets"], indent=2))
            summary["counts"]["datasets"] = len(payload["datasets"])

        if include_dataset_files:
            for ds in payload["dataset_paths"]:
                ds_path = ds.get("path")
                ds_id = ds.get("id")
                if ds_path and os.path.exists(ds_path):
                    for root, _, files in os.walk(ds_path):
                        for fname in files:
                            full = os.path.join(root, fname)
                            rel = os.path.relpath(full, ds_path)
                            zf.write(
                                full,
                                arcname=os.path.join("datasets", "files", ds_id, rel),
                            )

        # models
        if include_models:
            zf.writestr("models/metadata.json", json.dumps(payload["models"], indent=2))
            summary["counts"]["models"] = len(payload["models"])

        if include_model_files:
            for m in payload["models"]:
                for field in ("file_path", "definition_file_path"):
                    fpath = m.get(field)
                    if fpath and os.path.isfile(fpath):
                        m_id = m["_id"]
                        fname = os.path.basename(fpath)
                        zf.write(
                            fpath,
                            arcname=os.path.join("models", "files", m_id, fname),
                        )

        # reports
        if include_reports:
            zf.writestr("reports/metadata.json", json.dumps(payload["reports"], indent=2))
            summary["counts"]["reports"] = len(payload["reports"])

        if include_report_files:
            for rep in payload["report_paths"]:
                fpath = rep.get("file_path")
                r_id = rep.get("id")
                if fpath and os.path.isfile(fpath):
                    fname = os.path.basename(fpath)
                    zf.write(
                        fpath,
                        arcname=os.path.join("reports", "files", r_id, fname),
                    )

        zf.writestr("manifest.json", json.dumps(summary, indent=2))

    buf.seek(0)
    return buf


class ExportService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def build_export_zip(
        self,
        workspace: WorkspaceInDB,
        include_preprocessings: bool,
        include_executions: bool,
        include_optimizations: bool,
        include_datasets: bool,
        include_models: bool,
        include_reports: bool,
        include_activities: bool,
        include_metrics: bool,
        include_dataset_files: bool,
        include_model_files: bool,
        include_report_files: bool,
        progress_callback=None,
    ) -> io.BytesIO:
        """
        Phase 1 (async): collect all data from MongoDB with progress reporting.
        Phase 2 (thread pool): build the ZIP — blocking I/O runs off the event loop.
        """
        async def _prog(step: str, pct: int) -> None:
            if progress_callback:
                await progress_callback(step, pct)

        workspace_id = str(workspace.id)
        oid = PydanticObjectId(workspace_id)

        payload: dict[str, Any] = {
            "workspace": _serialize(workspace.model_dump()),
        }

        # ── preprocessing ────────────────────────────────────────────────────
        await _prog("Collecting preprocessing data...", 5)
        payload["preprocessing"] = []
        if include_preprocessings:
            preprocessing_docs = await Preprocessing.find(
                Preprocessing.workspace_id == oid
            ).to_list()
            payload["preprocessing"] = [_doc_to_dict(p) for p in preprocessing_docs]

        # ── executions ───────────────────────────────────────────────────────
        await _prog("Collecting execution records...", 15)
        payload["executions"] = []
        if include_executions:
            execution_docs = await Execution.find(
                Execution.workspace_id == oid
            ).to_list()
            payload["executions"] = [_doc_to_dict(e) for e in execution_docs]
            if not include_metrics:
                payload["executions"] = [_strip_heavy_metrics(d) for d in payload["executions"]]

        # ── optimizations ────────────────────────────────────────────────────
        await _prog("Collecting optimizations...", 25)
        payload["optimizations"] = []
        if include_optimizations:
            optimization_docs = await Optimization.find(
                Optimization.workspace_id == oid
            ).to_list()
            payload["optimizations"] = [_doc_to_dict(o) for o in optimization_docs]
            if not include_metrics:
                payload["optimizations"] = [_strip_heavy_metrics(d) for d in payload["optimizations"]]

        # ── activities ───────────────────────────────────────────────────────
        await _prog("Collecting activity log...", 42)
        payload["activities"] = []
        if include_activities:
            async for doc in self.db.activity_logs.find({"workspace_id": workspace.id}):
                doc["_id"] = str(doc["_id"])
                doc["workspace_id"] = str(doc.get("workspace_id", ""))
                doc["user_id"] = str(doc.get("user_id", ""))
                if isinstance(doc.get("created_at"), datetime):
                    doc["created_at"] = doc["created_at"].isoformat()
                payload["activities"].append(doc)

        # ── datasets ─────────────────────────────────────────────────────────
        await _prog("Collecting datasets...", 53)
        payload["datasets"] = []
        payload["dataset_paths"] = []
        if include_datasets or include_dataset_files:
            dataset_docs = await Dataset.find(Dataset.workspace_id == oid).to_list()
            if include_datasets:
                payload["datasets"] = [_doc_to_dict(d) for d in dataset_docs]
            payload["dataset_paths"] = [
                {"id": str(d.id), "path": d.path} for d in dataset_docs
            ]

        # ── models ───────────────────────────────────────────────────────────
        await _prog("Collecting models...", 65)
        payload["models"] = []
        if include_models or include_model_files:
            async for doc in self.db.ai_models.find({"workspace_id": workspace.id}):
                doc["_id"] = str(doc["_id"])
                doc["workspace_id"] = str(doc.get("workspace_id", ""))
                doc["owner_id"] = str(doc.get("owner_id", ""))
                if doc.get("original_model_id"):
                    doc["original_model_id"] = str(doc["original_model_id"])
                if doc.get("output_model_id"):
                    doc["output_model_id"] = str(doc["output_model_id"])
                for dt_field in ("created_at", "updated_at"):
                    if isinstance(doc.get(dt_field), datetime):
                        doc[dt_field] = doc[dt_field].isoformat()
                payload["models"].append(doc)

        # ── reports ──────────────────────────────────────────────────────────
        await _prog("Collecting reports...", 76)
        payload["reports"] = []
        payload["report_paths"] = []
        if include_reports or include_report_files:
            report_docs = await Report.find(Report.workspace_id == oid).to_list()
            if include_reports:
                payload["reports"] = [_doc_to_dict(r) for r in report_docs]
            payload["report_paths"] = [
                {"id": str(r.id), "file_path": r.file_path} for r in report_docs
            ]

        # ── Phase 2: build ZIP off the event loop ────────────────────────────
        await _prog("Building ZIP archive...", 85)
        buf = await asyncio.to_thread(
            _build_zip_sync,
            payload,
            workspace_id,
            workspace.name,
            include_preprocessings,
            include_executions,
            include_optimizations,
            include_datasets,
            include_models,
            include_reports,
            include_activities,
            include_metrics,
            include_dataset_files,
            include_model_files,
            include_report_files,
        )
        await _prog("Complete", 100)
        return buf
