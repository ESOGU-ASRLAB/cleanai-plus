from datetime import datetime
from typing import List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from app.models.activity import ActivityLog

class ActivityService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.activity_logs

    async def log_activity(self, workspace_id: str, user_id: str, action: str, details: Dict[str, Any] = None):
        log = {
            "workspace_id": ObjectId(workspace_id),
            "user_id": ObjectId(user_id),
            "action": action,
            "details": details or {},
            "created_at": datetime.utcnow()
        }
        await self.collection.insert_one(log)

    async def get_workspace_activities(self, workspace_id: str, limit: int = 10) -> List[ActivityLog]:
        logs = []
        if not ObjectId.is_valid(workspace_id):
            return []
            
        cursor = self.collection.find({"workspace_id": ObjectId(workspace_id)}).sort("created_at", -1).limit(limit)
        async for doc in cursor:
            logs.append(ActivityLog(**doc))
        return logs
