from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    SmallInteger,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Shop(Base):
    __tablename__ = "shops"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    name: Mapped[str | None] = mapped_column(String(255))
    location: Mapped[str | None] = mapped_column(String(128))
    rating: Mapped[float | None] = mapped_column(Numeric(3, 2))
    follower_count: Mapped[int | None] = mapped_column(Integer)
    raw_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    name: Mapped[str | None] = mapped_column(String(255))
    parent_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    level: Mapped[int | None] = mapped_column(SmallInteger)
    raw_json: Mapped[dict | None] = mapped_column(JSON)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    shop_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("shops.id", ondelete="SET NULL"), index=True
    )
    category_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str | None] = mapped_column(String(500))
    price: Mapped[int | None] = mapped_column(BigInteger)
    price_min: Mapped[int | None] = mapped_column(BigInteger)
    price_max: Mapped[int | None] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(8), default="VND")
    stock: Mapped[int | None] = mapped_column(Integer)
    sold: Mapped[int | None] = mapped_column(Integer)
    historical_sold: Mapped[int | None] = mapped_column(Integer)
    liked_count: Mapped[int | None] = mapped_column(Integer)
    rating_avg: Mapped[float | None] = mapped_column(Numeric(3, 2))
    rating_count: Mapped[int | None] = mapped_column(Integer)
    image: Mapped[str | None] = mapped_column(String(255))
    images_json: Mapped[list | None] = mapped_column(JSON)
    brand: Mapped[str | None] = mapped_column(String(128))
    location: Mapped[str | None] = mapped_column(String(128))
    raw_json: Mapped[dict | None] = mapped_column(JSON)
    first_seen_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    last_seen_at: Mapped[DateTime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
        index=True,
    )


class CrawlLog(Base):
    __tablename__ = "crawl_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    endpoint: Mapped[str | None] = mapped_column(String(255), index=True)
    source_url: Mapped[str | None] = mapped_column(String(1000))
    items_count: Mapped[int | None] = mapped_column(Integer)
    received_at: Mapped[DateTime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), index=True
    )
