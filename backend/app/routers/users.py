from typing import List
import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from app.models.auth import UserInDB, UserUpdate
from app.services.auth import AuthService
from app.services.user_service import UserService
from app.database.mongodb import get_database
from app.dependencies import get_current_user

router = APIRouter(prefix="/users", tags=["Users"])

def get_user_service(db=Depends(get_database)):
    return UserService(db)

@router.get("/me", response_model=UserInDB)
async def read_users_me(current_user: UserInDB = Depends(get_current_user)):
    return current_user

@router.put("/me", response_model=UserInDB)
async def update_user_me(
    user_update: UserUpdate,
    current_user: UserInDB = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    updated_user = await user_service.update_user(str(current_user.id), user_update)
    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found")
    return updated_user

@router.post("/me/avatar", response_model=UserInDB)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
        
    # Create directory if it doesn't exist
    upload_dir = os.path.join("uploads", "avatars")
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate unique filename
    file_extension = os.path.splitext(file.filename)[1]
    filename = f"{current_user.id}{file_extension}"
    file_path = os.path.join(upload_dir, filename)
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Update user with avatar URL
    avatar_url = f"/uploads/avatars/{filename}"
    user_update = UserUpdate(avatar_url=avatar_url)
    updated_user = await user_service.update_user(str(current_user.id), user_update)
    
    return updated_user

@router.delete("/me/avatar", response_model=UserInDB)
async def delete_avatar(
    current_user: UserInDB = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    if current_user.avatar_url:
        # Remove the leading slash to get the relative path
        file_path = current_user.avatar_url.lstrip("/")
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"Error deleting avatar file: {e}")
        
        # Update user to remove avatar URL
        user_update = UserUpdate(avatar_url=None)
        updated_user = await user_service.update_user(str(current_user.id), user_update)
        return updated_user
    
    return current_user

@router.get("/me/stats")
async def get_user_stats(
    current_user: UserInDB = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    stats = await user_service.get_user_stats(str(current_user.id))
    return stats

@router.get("/me/activities")
async def get_user_activities(
    limit: int = 10,
    current_user: UserInDB = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    activities = await user_service.get_user_activities(str(current_user.id), limit)
    return activities
