from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    # 仅做最小强度校验；更严格策略应在产品侧明确后统一调整。
    password: str = Field(min_length=8, max_length=128)


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: EmailStr

