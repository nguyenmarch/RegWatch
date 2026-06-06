from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User


class UserRepository:

    async def get_by_username(self, db: AsyncSession, username: str) -> User | None:
        result = await db.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()

    async def get_by_id(self, db: AsyncSession, user_id: int) -> User | None:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def exists_username(self, db: AsyncSession, username: str) -> bool:
        result = await db.execute(select(User.id).where(User.username == username).limit(1))
        return result.scalar_one_or_none() is not None

    async def create(
        self,
        db: AsyncSession,
        username: str,
        email: str,
        password: str,
        role: str = "viewer",
    ) -> User:
        user = User(
            username=username,
            email=email,
            hashed_password=hash_password(password),
            role=role,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    async def ensure_seed_user(
        self,
        db: AsyncSession,
        username: str,
        email: str,
        password: str,
        role: str,
    ) -> User:
        user = await self.get_by_username(db, username)
        if user is None:
            return await self.create(
                db,
                username=username,
                email=email,
                password=password,
                role=role,
            )

        user.hashed_password = hash_password(password)
        user.role = role
        user.is_active = True
        await db.commit()
        await db.refresh(user)
        return user

    async def exists_any(self, db: AsyncSession) -> bool:
        result = await db.execute(select(User.id).limit(1))
        return result.scalar_one_or_none() is not None


user_repo = UserRepository()
