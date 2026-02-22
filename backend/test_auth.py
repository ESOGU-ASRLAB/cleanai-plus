import asyncio
from app.database.mongodb import connect_to_mongo, get_database
from app.services.auth.auth_service import AuthService
from app.models.auth.user import UserCreate

async def main():
    await connect_to_mongo()
    db = await get_database()
    service = AuthService(db)
    user = UserCreate(email='test6@test.com', password='password123', full_name='Test User')
    try:
        await service.create_user(user)
        print('Success')
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f'Error: {e}')

if __name__ == '__main__':
    asyncio.run(main())
