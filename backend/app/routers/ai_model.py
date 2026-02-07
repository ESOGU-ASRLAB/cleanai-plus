from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File, Form
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database.mongodb import get_database
from app.dependencies import get_current_user
from app.models.auth import UserInDB
from app.models.ai_model import AIModelInDB, ModelFormat
from app.services.ai_model_service import AIModelService
from app.services.workspace import WorkspaceService
from app.services.activity_service import ActivityService

router = APIRouter(prefix="/workspaces/{workspace_id}/models", tags=["AI Models"])

def get_model_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> AIModelService:
    return AIModelService(db)

def get_workspace_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> WorkspaceService:
    return WorkspaceService(db)

def get_activity_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> ActivityService:
    return ActivityService(db)

@router.post("/", response_model=AIModelInDB, status_code=status.HTTP_201_CREATED)
async def upload_model(
    workspace_id: str,
    name: str = Form(...),
    description: str = Form(None),
    format: ModelFormat = Form(...),
    file: UploadFile = File(...),
    definition_file: Optional[UploadFile] = File(None),
    current_user: UserInDB = Depends(get_current_user),
    model_service: AIModelService = Depends(get_model_service),
    workspace_service: WorkspaceService = Depends(get_workspace_service),
    activity_service: ActivityService = Depends(get_activity_service)
):
    """
    Upload a new AI model to a workspace.
    Handles multipart/form-data for file upload and metadata.
    """
    # Verify workspace access
    workspace = await workspace_service.get_workspace_by_id(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    if str(workspace.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to add models to this workspace")

    # Validate file extension based on recommended practices
    filename = file.filename.lower()
    allowed_exts = {
        ModelFormat.STATE_DICT: ['.pt', '.pth'],
        ModelFormat.FULL_MODEL: ['.pt', '.pth', '.pkl'],
        ModelFormat.TORCHSCRIPT: ['.pt', '.pth'],
        ModelFormat.SAFETENSORS: ['.safetensors'],
        ModelFormat.CHECKPOINT: ['.ckpt', '.pt', '.pth'],
        ModelFormat.ONNX: ['.onnx']
    }
    
    valid_exts = allowed_exts.get(format, [])
    if not any(filename.endswith(ext) for ext in valid_exts):
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file extension for format {format.value}. Expected: {', '.join(valid_exts)}"
        )

    model = await model_service.create_model(
        name=name,
        description=description,
        format=format,
        workspace_id=workspace_id,
        owner_id=str(current_user.id),
        file=file,
        definition_file=definition_file
    )

    await activity_service.log_activity(
        workspace_id=workspace_id,
        user_id=str(current_user.id),
        action="model_uploaded",
        details={"model_name": name, "format": format}
    )

    return model

@router.get("/", response_model=List[AIModelInDB])
async def list_workspace_models(
    workspace_id: str,
    current_user: UserInDB = Depends(get_current_user),
    model_service: AIModelService = Depends(get_model_service),
    workspace_service: WorkspaceService = Depends(get_workspace_service)
):
    """List all models in a workspace."""
    # Verify workspace access
    workspace = await workspace_service.get_workspace_by_id(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    if str(workspace.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    return await model_service.get_models_by_workspace(workspace_id)

from pydantic import BaseModel

class DefinitionUpdate(BaseModel):
    code: str

@router.get("/{model_id}/definition", response_model=dict)
async def get_model_definition(
    workspace_id: str,
    model_id: str,
    current_user: UserInDB = Depends(get_current_user),
    model_service: AIModelService = Depends(get_model_service),
    workspace_service: WorkspaceService = Depends(get_workspace_service)
):
    """Get the definition code of a model."""
    workspace = await workspace_service.get_workspace_by_id(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    if str(workspace.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    code = await model_service.get_model_definition(model_id)
    if code is None:
        raise HTTPException(status_code=404, detail="Definition file not found or empty")
    
    return {"code": code}

@router.put("/{model_id}/definition", status_code=status.HTTP_200_OK)
async def update_model_definition(
    workspace_id: str,
    model_id: str,
    definition: DefinitionUpdate,
    current_user: UserInDB = Depends(get_current_user),
    model_service: AIModelService = Depends(get_model_service),
    workspace_service: WorkspaceService = Depends(get_workspace_service)
):
    """Update the definition code of a model."""
    workspace = await workspace_service.get_workspace_by_id(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    if str(workspace.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    success = await model_service.update_model_definition(model_id, definition.code)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update definition. Model might not have a linked definition file.")
    
    return {"message": "Definition updated successfully"}

@router.get("/{model_id}/structure", response_model=List[dict])
async def get_model_structure(
    workspace_id: str,
    model_id: str,
    current_user: UserInDB = Depends(get_current_user),
    model_service: AIModelService = Depends(get_model_service),
    workspace_service: WorkspaceService = Depends(get_workspace_service)
):
    """Get the structure/layers of a model."""
    workspace = await workspace_service.get_workspace_by_id(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    if str(workspace.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    layers = await model_service.get_model_structure(model_id)
    if layers is None:
        return []
    
    return layers

@router.post("/{model_id}/convert", response_model=AIModelInDB)
async def convert_model(
    workspace_id: str,
    model_id: str,
    target_format: str = "onnx",
    current_user: UserInDB = Depends(get_current_user),
    model_service: AIModelService = Depends(get_model_service),
    workspace_service: WorkspaceService = Depends(get_workspace_service)
):
    """Convert a model to a different format (e.g. ONNX)."""
    workspace = await workspace_service.get_workspace_by_id(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    if str(workspace.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    if target_format.lower() != "onnx":
        raise HTTPException(status_code=400, detail="Only 'onnx' conversion is currently supported.")

    try:
        new_model = await model_service.convert_model_to_onnx(model_id, str(current_user.id))
        return new_model
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")

