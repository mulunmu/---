from fastapi import APIRouter

from app.api.v1.router import router as v1_router

api_router = APIRouter()
# API 版本前缀统一在此收口，避免各模块自行拼接导致路径不一致。
api_router.include_router(v1_router, prefix="/api/v1")

