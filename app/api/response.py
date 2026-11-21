from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    code: int = 0
    data: T | None = None
    message: str = "ok"


def ok(data: Any = None, message: str = "ok") -> dict[str, Any]:
    # 前端 `api-client.js` 依赖 {code,data,message} 包装结构做统一解包。
    return {"code": 0, "data": data, "message": message}

