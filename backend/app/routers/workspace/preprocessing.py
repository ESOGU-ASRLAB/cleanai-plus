from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from app.services.workspace.preprocessing_service import PreprocessingService
from app.models.auth.user import User
from app.dependencies import get_current_user
from app.schemas.preprocessing import PreprocessingCreate, PreprocessingUpdate, PreprocessingResponse

router = APIRouter()

def get_preprocessing_service() -> PreprocessingService:
    return PreprocessingService()

@router.post("/", response_model=PreprocessingResponse, status_code=status.HTTP_201_CREATED)
async def create_preprocessing(
    workspace_id: str,
    request: PreprocessingCreate,
    current_user: User = Depends(get_current_user),
    service: PreprocessingService = Depends(get_preprocessing_service)
):
    # TODO: Verify workspace access
    return await service.create_preprocessing(workspace_id, request)

@router.get("/", response_model=List[PreprocessingResponse])
async def list_preprocessing(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    service: PreprocessingService = Depends(get_preprocessing_service)
):
    # TODO: Verify workspace access
    return await service.get_all_by_workspace(workspace_id)

@router.get("/{preprocessing_id}", response_model=PreprocessingResponse)
async def get_preprocessing(
    workspace_id: str,
    preprocessing_id: str,
    current_user: User = Depends(get_current_user),
    service: PreprocessingService = Depends(get_preprocessing_service)
):
    # TODO: Verify workspace access
    preprocessing = await service.get_preprocessing(preprocessing_id)
    if not preprocessing or str(preprocessing.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Preprocessing definition not found")
    return preprocessing

@router.put("/{preprocessing_id}", response_model=PreprocessingResponse)
async def update_preprocessing(
    workspace_id: str,
    preprocessing_id: str,
    request: PreprocessingUpdate,
    current_user: User = Depends(get_current_user),
    service: PreprocessingService = Depends(get_preprocessing_service)
):
    # TODO: Verify workspace access
    preprocessing = await service.get_preprocessing(preprocessing_id)
    if not preprocessing or str(preprocessing.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Preprocessing definition not found")
        
    updated = await service.update_preprocessing(preprocessing_id, request)
    return updated

@router.delete("/{preprocessing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_preprocessing(
    workspace_id: str,
    preprocessing_id: str,
    current_user: User = Depends(get_current_user),
    service: PreprocessingService = Depends(get_preprocessing_service)
):
    # TODO: Verify workspace access (check if user owns workspace)
    preprocessing = await service.get_preprocessing(preprocessing_id)
    if not preprocessing or str(preprocessing.workspace_id) != workspace_id:
        raise HTTPException(status_code=404, detail="Preprocessing definition not found")
        
    await service.delete_preprocessing(preprocessing_id)
