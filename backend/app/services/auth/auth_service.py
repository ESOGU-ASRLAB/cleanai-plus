from datetime import datetime
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.models.auth import UserCreate, UserInDB
from app.utils.security import get_password_hash, verify_password


class AuthService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.users_collection = db.users

    async def create_user(self, user_create: UserCreate) -> UserInDB:
        """Create a new user."""
        # Check if user already exists
        existing_user = await self.users_collection.find_one({"email": user_create.email})
        if existing_user:
            raise ValueError("User with this email already exists")

        # Create user document
        user_dict = user_create.model_dump(exclude={"password"})
        user_dict["hashed_password"] = get_password_hash(user_create.password)
        user_dict["created_at"] = datetime.utcnow()
        user_dict["updated_at"] = datetime.utcnow()

        # Insert user
        result = await self.users_collection.insert_one(user_dict)
        user_dict["_id"] = result.inserted_id

        return UserInDB(**user_dict)

    async def get_user_by_email(self, email: str) -> Optional[UserInDB]:
        """Get user by email."""
        user_dict = await self.users_collection.find_one({"email": email})
        if user_dict:
            return UserInDB(**user_dict)
        return None

    async def get_user_by_id(self, user_id: str) -> Optional[UserInDB]:
        """Get user by ID."""
        user_dict = await self.users_collection.find_one({"_id": ObjectId(user_id)})
        if user_dict:
            return UserInDB(**user_dict)
        return None

    async def authenticate_user(self, email: str, password: str) -> Optional[UserInDB]:
        """Authenticate a user."""
        user = await self.get_user_by_email(email)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    async def update_user(self, user_id: str, update_data: dict) -> Optional[UserInDB]:
        """Update user data."""
        update_data["updated_at"] = datetime.utcnow()
        
        result = await self.users_collection.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$set": update_data},
            return_document=True
        )
        
        if result:
            return UserInDB(**result)
        return None
