import asyncio
from app.database.mongodb import connect_to_mongo, get_database
from app.services.auth.auth_service import AuthService

async def main():
    await connect_to_mongo()
    db = await get_database()
    service = AuthService(db)
    
    # Get the user we just created
    user = await service.get_user_by_email('test6@test.com')
    if user:
        try:
            await service.verify_email(user.email, user.verification_code)
            print('Success')
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f'Error: {e}')
    else:
        print('User not found')

if __name__ == '__main__':
    asyncio.run(main())
