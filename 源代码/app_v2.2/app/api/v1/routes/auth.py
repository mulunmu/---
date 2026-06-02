from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.response import ok
from app.api.v1.schemas.auth import LoginOut, RegisterIn, UserOut
from app.db.session import get_db
from app.domain.models import User
from app.services.auth_service import AuthService


router = APIRouter()


@router.post("/register")
async def register(payload: RegisterIn, db: AsyncSession = Depends(get_db)):
    # 注册后直接签发 token，前端无需二次登录。
    token = await AuthService(db).register(email=str(payload.email), password=payload.password)
    return ok(LoginOut(access_token=token).model_dump())


@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    # OAuth2PasswordRequestForm 约定使用 username 字段承载登录账号。
    token = await AuthService(db).login(email=form_data.username, password=form_data.password)
    return ok(LoginOut(access_token=token).model_dump())


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    # /me 只返回最小必要用户信息，避免暴露敏感字段。
    return ok(UserOut(id=str(current_user.id), email=current_user.email).model_dump())

