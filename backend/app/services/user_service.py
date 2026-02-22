from typing import Dict, Any, List
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from app.models.auth.user import UserInDB, UserUpdate
from app.models.auth.notification_settings import NotificationSettingsInDB, NotificationSettingsUpdate
from app.models.activity import ActivityLog

class UserService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.users_collection = db.users
        self.workspaces_collection = db.workspaces
        self.executions_collection = db.Execution # Beanie uses Capitalized collection name by default usually, but let's check
        self.activity_collection = db.activity_logs
        
    async def get_user_stats(self, user_id: str) -> Dict[str, Any]:
        """Get aggregate statistics for a user."""
        oid = ObjectId(user_id)
        
        # Count workspaces
        workspace_count = await self.workspaces_collection.count_documents({"owner_id": oid})
        
        # Count executions (Assuming executions have owner_id or linked via workspace)
        # Executions are linked to workspace. We need to find workspaces first, then executions
        # Or if Execution has user_id/owner_id directly? 
        # Looking at Execution model: workspace_id only.
        
        # Get user's workspace IDs
        workspaces = await self.workspaces_collection.find({"owner_id": oid}, {"_id": 1}).to_list(length=1000)
        workspace_ids = [w["_id"] for w in workspaces]
        
        execution_count = 0
        total_co2 = 0.0
        
        if workspace_ids:
             # Beanie creates collection 'Execution' (default) or 'executions'? 
             # I'll try to find 'Execution' based on typical Beanie info, or 'executions'
             # If I can't be sure, I'll list collection names or try both. 
             # Safe bet: assume it's "Execution" because model name is Execution and Beanie defaults to that.
             # Actually, let's look at `backend/app/models/workspace/execution.py` again logic later.
             # For now I will assume "Execution"
             
             pipeline = [
                 {"$match": {"workspace_id": {"$in": workspace_ids}}},
                 {"$group": {
                     "_id": None, 
                     "count": {"$sum": 1},
                     # Assuming metrics field has emissions data if available
                     "total_emissions": {"$sum": "$metrics.emissions"} 
                 }}
             ]
             
             # Try to run on 'Execution' collection
             try:
                results = await self.db["Execution"].aggregate(pipeline).to_list(length=1)
                if results:
                    execution_count = results[0].get("count", 0)
                    total_co2 = results[0].get("total_emissions", 0) or 0.0
             except:
                 pass

        return {
            "workspaces_count": workspace_count,
            "models_trained": execution_count,
            "co2_saved": total_co2 # Placeholder logic
        }

    async def get_user_activities(self, user_id: str, limit: int = 10) -> List[Dict]:
        """Get recent activities for the user."""
        cursor = self.activity_collection.find({"user_id": ObjectId(user_id)}).sort("created_at", -1).limit(limit)
        activities = []
        async for doc in cursor:
            # Convert ObjectId to str for JSON serialization
            doc["_id"] = str(doc["_id"])
            doc["workspace_id"] = str(doc["workspace_id"]) if "workspace_id" in doc else None
            doc["user_id"] = str(doc["user_id"])
            activities.append(doc)
        return activities

    async def update_user(self, user_id: str, update_data: UserUpdate) -> UserInDB:
        user_dict = update_data.model_dump(exclude_unset=True)
        
        if not user_dict:
            return None
            
        user_dict["updated_at"] = datetime.utcnow()
        
        await self.users_collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": user_dict}
        )
        
        updated_user = await self.users_collection.find_one({"_id": ObjectId(user_id)})
        return UserInDB(**updated_user) if updated_user else None

    async def get_notification_settings(self, user_id: str) -> NotificationSettingsInDB:
        settings = await self.db.notification_settings.find_one({"user_id": ObjectId(user_id)})
        if not settings:
            # Create default settings
            new_settings = {
                "user_id": ObjectId(user_id),
                "execution_success": True,
                "execution_failure": True,
                "marketing": False,
                "updated_at": datetime.utcnow()
            }
            result = await self.db.notification_settings.insert_one(new_settings)
            new_settings["_id"] = result.inserted_id
            return NotificationSettingsInDB(**new_settings)
        return NotificationSettingsInDB(**settings)

    async def update_notification_settings(self, user_id: str, update_data: NotificationSettingsUpdate) -> NotificationSettingsInDB:
        update_dict = update_data.model_dump(exclude_unset=True)
        update_dict["updated_at"] = datetime.utcnow()
        
        await self.db.notification_settings.update_one(
            {"user_id": ObjectId(user_id)},
            {"$set": update_dict},
            upsert=True
        )
        
        return await self.get_notification_settings(user_id)
