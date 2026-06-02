from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine
import logging

from app.db.session import get_engine

logger = logging.getLogger(__name__)


def get_core_engine() -> AsyncEngine:
    return get_engine()


async def ensure_vector_extension(engine: AsyncEngine | None = None) -> None:
    eng = engine or get_engine()
    # 仅在 PostgreSQL + asyncpg 下启用 pgvector，其他数据库直接跳过。
    if eng.url.drivername != "postgresql+asyncpg":
        return
    try:
        async with eng.begin() as conn:
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector;")
    except Exception:
        # Keep startup resilient in mixed/local environments.
        logger.exception("skip ensure_vector_extension due to db extension error")

