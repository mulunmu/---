from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    # 全项目 ORM 基类统一定义在此，便于迁移/自动建表时集中管理 metadata。
    pass

