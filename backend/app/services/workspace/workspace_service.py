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

    async def get_workspace_stats(self, workspace_id: str) -> dict:
        """Get aggregate statistics for a workspace."""
        if not ObjectId.is_valid(workspace_id):
            return {"models": 0, "datasets": 0, "executions": 0, "co2_saved": 0.0}
            
        oid = ObjectId(workspace_id)
        
        # Count models
        models_count = await self.db.ai_models.count_documents({"workspace_id": oid})
        
        # Count datasets
        datasets_count = await self.db.datasets.count_documents({"workspace_id": oid})
        
        # Count executions and calculate CO2
        executions_count = 0
        total_co2 = 0.0
        
        pipeline = [
            {"$match": {"workspace_id": oid}},
            {"$group": {
                "_id": None, 
                "count": {"$sum": 1},
                "total_emissions": {"$sum": "$metrics.emissions"} 
            }}
        ]
        
        try:
            results = await self.db["Execution"].aggregate(pipeline).to_list(length=1)
            if results:
                executions_count = results[0].get("count", 0)
                total_co2 = results[0].get("total_emissions", 0) or 0.0
        except:
            # Fallback if aggregation fails
            executions_count = await self.db.Execution.count_documents({"workspace_id": oid})
        
        return {
            "models": models_count,
            "datasets": datasets_count,
            "executions": executions_count,
            "co2_saved": total_co2
        }
