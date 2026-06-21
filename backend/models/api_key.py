import secrets

from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.sql import func

from config.database import Base


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(64), unique=True, nullable=False, index=True)
    label = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, server_default="true")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    requests_count = Column(Integer, default=0, server_default="0")

    @staticmethod
    def generate() -> str:
        return secrets.token_urlsafe(32)
