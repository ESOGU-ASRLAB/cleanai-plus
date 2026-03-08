from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database.mongodb import get_database
from app.dependencies import get_current_user
from app.models.auth import UserInDB
from app.models.workspace import WorkspaceCreate
from app.models.activity import ActivityLog
from app.schemas.workspace import WorkspaceCreateRequest, WorkspaceUpdateRequest, WorkspaceResponse, PublicWorkspaceResponse
from app.services.workspace import WorkspaceService
from app.services.activity_service import ActivityService

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


def get_workspace_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> WorkspaceService:
    return WorkspaceService(db)

def get_activity_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> ActivityService:
    return ActivityService(db)


@router.get("/public/search", response_model=List[PublicWorkspaceResponse])
async def search_public_workspaces(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=8, ge=1, le=20),
    workspace_service: WorkspaceService = Depends(get_workspace_service),
):
    """Search public workspaces. No authentication required."""
    results = await workspace_service.search_public_workspaces(q, limit)
    return [
        PublicWorkspaceResponse(
            id=doc["_id"],
            name=doc["name"],
            description=doc.get("description"),
            owner_name=doc.get("owner_name", "Unknown"),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )
        for doc in results
    ]


@router.post("/", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    request: WorkspaceCreateRequest,
    current_user: UserInDB = Depends(get_current_user),
    workspace_service: WorkspaceService = Depends(get_workspace_service),
    activity_service: ActivityService = Depends(get_activity_service)
):
    """Create a new workspace."""
    workspace_create = WorkspaceCreate(
        name=request.name,
        description=request.description,
        is_public=request.is_public
    )
    
    workspace = await workspace_service.create_workspace(
        workspace_create, 
        str(current_user.id)
    )

    await activity_service.log_activity(
        workspace_id=str(workspace.id),
        user_id=str(current_user.id),
        action="workspace_created",
        details={"name": workspace.name}
    )
    
    return WorkspaceResponse(
        id=str(workspace.id),
        name=workspace.name,
        description=workspace.description,
        is_public=workspace.is_public,
        owner_id=str(workspace.owner_id),
        created_at=workspace.created_at,
        updated_at=workspace.updated_at
    )


@router.get("/", response_model=List[WorkspaceResponse])
async def list_workspaces(
    current_user: UserInDB = Depends(get_current_user),
    workspace_service: WorkspaceService = Depends(get_workspace_service)
):
    """List all workspaces for the current user."""
    workspaces = await workspace_service.get_workspaces_by_user(str(current_user.id))
    
    return [
        WorkspaceResponse(
            id=str(w.id),
            name=w.name,
            description=w.description,
            is_public=w.is_public,
            owner_id=str(w.owner_id),
            created_at=w.created_at,
            updated_at=w.updated_at
        )
        for w in workspaces
    ]


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: str,
    current_user: UserInDB = Depends(get_current_user),
    workspace_service: WorkspaceService = Depends(get_workspace_service)
):
    """Get a specific workspace."""
    workspace = await workspace_service.get_workspace_by_id(workspace_id)
    
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found"
        )
        
    # Check ownership (start simple)
    if str(workspace.owner_id) != str(current_user.id) and not workspace.is_public:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this workspace"
        )
        
    return WorkspaceResponse(
        id=str(workspace.id),
        name=workspace.name,
        description=workspace.description,
        is_public=workspace.is_public,
        owner_id=str(workspace.owner_id),
        created_at=workspace.created_at,
        updated_at=workspace.updated_at
    )


@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: str,
    request: WorkspaceUpdateRequest,
    current_user: UserInDB = Depends(get_current_user),
    workspace_service: WorkspaceService = Depends(get_workspace_service),
    activity_service: ActivityService = Depends(get_activity_service)
):
    """Update a workspace."""
    workspace = await workspace_service.get_workspace_by_id(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    if str(workspace.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = request.model_dump(exclude_unset=True)
    if not update_data:
        return WorkspaceResponse(
            id=str(workspace.id),
            name=workspace.name,
            description=workspace.description,
            is_public=workspace.is_public,
            owner_id=str(workspace.owner_id),
            created_at=workspace.created_at,
            updated_at=workspace.updated_at
        )

    updated_workspace = await workspace_service.update_workspace(workspace_id, str(current_user.id), update_data)
    
    if not updated_workspace:
        raise HTTPException(status_code=400, detail="Failed to update workspace")

    await activity_service.log_activity(
        workspace_id=str(updated_workspace.id),
        user_id=str(current_user.id),
        action="workspace_updated",
        details={"fields_updated": list(update_data.keys())}
    )

    return WorkspaceResponse(
        id=str(updated_workspace.id),
        name=updated_workspace.name,
        description=updated_workspace.description,
        is_public=updated_workspace.is_public,
        owner_id=str(updated_workspace.owner_id),
        created_at=updated_workspace.created_at,
        updated_at=updated_workspace.updated_at
    )


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: str,
    current_user: UserInDB = Depends(get_current_user),
    workspace_service: WorkspaceService = Depends(get_workspace_service)
):
    """Delete a workspace."""
    success = await workspace_service.delete_workspace(workspace_id, str(current_user.id))
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found or you don't have permission to delete it"
        )
    return None


@router.get("/{workspace_id}/activities", response_model=List[ActivityLog])
async def list_workspace_activities(
    workspace_id: str,
    limit: int = 5,
    current_user: UserInDB = Depends(get_current_user),
    workspace_service: WorkspaceService = Depends(get_workspace_service),
    activity_service: ActivityService = Depends(get_activity_service)
):
    """List activities for a workspace."""
    workspace = await workspace_service.get_workspace_by_id(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if str(workspace.owner_id) != str(current_user.id) and not workspace.is_public:
        raise HTTPException(status_code=403, detail="Not authorized")

    return await activity_service.get_workspace_activities(workspace_id, limit=limit)

@router.get("/{workspace_id}/stats")
async def get_workspace_stats(
    workspace_id: str,
    current_user: UserInDB = Depends(get_current_user),
    workspace_service: WorkspaceService = Depends(get_workspace_service)
):
    """Get statistics for a workspace."""
    workspace = await workspace_service.get_workspace_by_id(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if str(workspace.owner_id) != str(current_user.id) and not workspace.is_public:
        raise HTTPException(status_code=403, detail="Not authorized")

    return await workspace_service.get_workspace_stats(workspace_id)
