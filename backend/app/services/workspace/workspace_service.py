from datetime import datetime
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.models.workspace import WorkspaceCreate, WorkspaceInDB, WorkspaceUpdate


class WorkspaceService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.workspaces_collection = db.workspaces

    async def create_workspace(self, workspace_create: WorkspaceCreate, owner_id: str) -> WorkspaceInDB:
        """Create a new workspace."""
        workspace_dict = workspace_create.model_dump()
        workspace_dict["owner_id"] = ObjectId(owner_id)
        workspace_dict["created_at"] = datetime.utcnow()
        workspace_dict["updated_at"] = datetime.utcnow()

        result = await self.workspaces_collection.insert_one(workspace_dict)
        workspace_dict["_id"] = result.inserted_id

        return WorkspaceInDB(**workspace_dict)

    async def get_workspaces_by_user(self, user_id: str) -> List[WorkspaceInDB]:
        """Get all workspaces for a specific user."""
        workspaces = []
        cursor = self.workspaces_collection.find({"owner_id": ObjectId(user_id)})
        async for document in cursor:
            workspaces.append(WorkspaceInDB(**document))
        return workspaces

    async def get_workspace_by_id(self, workspace_id: str) -> Optional[WorkspaceInDB]:
        """Get a workspace by ID."""
        if not ObjectId.is_valid(workspace_id):
            return None
        document = await self.workspaces_collection.find_one({"_id": ObjectId(workspace_id)})
        if document:
            return WorkspaceInDB(**document)
        return None

    async def delete_workspace(self, workspace_id: str, user_id: str) -> bool:
        """Delete a workspace knowing the user is the owner."""
        if not ObjectId.is_valid(workspace_id):
            return False
            
        result = await self.workspaces_collection.delete_one({
            "_id": ObjectId(workspace_id),
            "owner_id": ObjectId(user_id)
        })
        return result.deleted_count > 0
