from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional
from app.config import settings


class Database:
    client: Optional[AsyncIOMotorClient] = None
    

database = Database()


async def get_database():
    return database.client[settings.database_name]


async def connect_to_mongo():
    """Connect to MongoDB"""
    database.client = AsyncIOMotorClient(settings.mongodb_url)
    print(f"Connected to MongoDB at {settings.mongodb_url}")


async def close_mongo_connection():
    """Close MongoDB connection"""
    if database.client:
        database.client.close()
        print("Closed MongoDB connection")
