from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import User


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_email(self, email: str) -> User | None:
        res = await self.db.execute(select(User).where(User.email == email))
        return res.scalar_one_or_none()

    async def get_by_id(self, user_id: str) -> User | None:
        # 入参按字符串传递，内部严格按 UUID 解析，避免无效 id 导致 DB 报错。
        try:
            uid = uuid.UUID(user_id)
        except ValueError:
            return None
        res = await self.db.execute(select(User).where(User.id == uid))
        return res.scalar_one_or_none()

    async def create(self, *, email: str, hashed_password: str) -> User:
        user = User(email=email, hashed_password=hashed_password)
        self.db.add(user)
        await self.db.flush()
        return user

