from datetime import datetime, timedelta
import random
import string
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.models.auth import UserCreate, UserInDB
from app.utils.security import get_password_hash, verify_password
from app.services.email_service import send_verification_email

def generate_verification_code(length=5):
    return ''.join(random.choices(string.digits, k=length))

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

        # Generate verification code
        verification_code = generate_verification_code()
        expires_at = datetime.utcnow() + timedelta(seconds=180)

        # Create user document
        user_dict = user_create.model_dump(exclude={"password"})
        user_dict["hashed_password"] = get_password_hash(user_create.password)
        user_dict["verification_code"] = verification_code
        user_dict["verification_code_expires_at"] = expires_at
        user_dict["is_verified"] = False
        user_dict["created_at"] = datetime.utcnow()
        user_dict["updated_at"] = datetime.utcnow()

        # Insert user
        result = await self.users_collection.insert_one(user_dict)
        user_dict["_id"] = result.inserted_id

        # Send email
        send_verification_email(user_create.email, verification_code, user_create.full_name)

        return UserInDB(**user_dict)

    async def verify_email(self, email: str, code: str) -> bool:
        user = await self.get_user_by_email(email)
        if not user:
            raise ValueError("User not found")
        if user.is_verified:
            raise ValueError("User is already verified")
        if user.verification_code != code:
            raise ValueError("Invalid verification code")
        if user.verification_code_expires_at and user.verification_code_expires_at < datetime.utcnow():
            raise ValueError("Verification code has expired")

        await self.users_collection.update_one(
            {"_id": user.id},
            {"$set": {
                "is_verified": True,
                "verification_code": None,
                "verification_code_expires_at": None,
                "updated_at": datetime.utcnow()
            }}
        )
        return True

    async def resend_verification_code(self, email: str) -> bool:
        user = await self.get_user_by_email(email)
        if not user:
            raise ValueError("User not found")
        if user.is_verified:
            raise ValueError("User is already verified")

        verification_code = generate_verification_code()
        expires_at = datetime.utcnow() + timedelta(seconds=180)

        await self.users_collection.update_one(
            {"_id": user.id},
            {"$set": {
                "verification_code": verification_code,
                "verification_code_expires_at": expires_at,
                "updated_at": datetime.utcnow()
            }}
        )

        send_verification_email(user.email, verification_code, user.full_name)
        return True

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
