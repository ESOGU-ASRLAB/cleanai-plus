from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

# Patch to increase file upload limit for large datasets
# Monkey patch Request.form to increase default max_files and max_fields
import starlette.requests
_original_form = starlette.requests.Request.form

async def _custom_form(self, *, max_files=100000, max_fields=100000):
    return await _original_form(self, max_files=max_files, max_fields=max_fields)

starlette.requests.Request.form = _custom_form

from app.database.mongodb import connect_to_mongo, close_mongo_connection, get_database
from app.routers import health
from app.routers.auth import auth_router
from app.routers.workspace import workspace_router
from app.routers.ai_model import router as ai_model_router
from app.routers.code_assist import router as code_assist_router
from app.routers.dataset import router as dataset_router
from app.routers.workspace.preprocessing import router as preprocessing_router
from app.routers.workspace.execution import router as execution_router
from app.config import settings
from beanie import init_beanie
from app.models.dataset.dataset import Dataset
from app.models.workspace.preprocessing import Preprocessing
from app.models.workspace.execution import Execution



@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager"""
    # Startup
    await connect_to_mongo()
    db = await get_database()
    await init_beanie(database=db, document_models=[Dataset, Preprocessing, Execution])

    # Initialize database by creating a system collection
    await db.system_info.insert_one({
        "initialized": True,
        "version": "1.0.0",
        "created_at": "2026-01-25"
    })
    print("Database initialized successfully")
    
    yield
    
    # Shutdown
    await close_mongo_connection()


app = FastAPI(
    title="CleanAI Plus API",
    description="FARM Stack Application",
    version="1.0.0",
    lifespan=lifespan
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print(f"Validation error: {exc.errors()}")
    print(f"Body: {exc.body}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": str(exc.body)},
    )

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(auth_router, prefix="/api")
app.include_router(workspace_router, prefix="/api")
app.include_router(ai_model_router, prefix="/api")
app.include_router(dataset_router, prefix="/api/workspaces/{workspace_id}/datasets", tags=["Datasets"])
app.include_router(preprocessing_router, prefix="/api/workspaces/{workspace_id}/preprocessing", tags=["Preprocessing"])
app.include_router(execution_router, prefix="/api/workspaces/{workspace_id}/executions", tags=["Executions"])
app.include_router(code_assist_router, prefix="/api")

# Mount uploads directory for static access
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.environment == "development"
    )
