from sqlalchemy import BigInteger, Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from config.database import Base


class TelegramSubscription(Base):
    __tablename__ = "telegram_subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_id = Column(BigInteger, nullable=False, index=True)
    username = Column(String, nullable=True)
    filters_json = Column(Text, nullable=False, default="{}")
    filter_label = Column(String, nullable=True)
    last_notified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Boolean, default=True, nullable=False)
