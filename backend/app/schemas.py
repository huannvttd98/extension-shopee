from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class IngestBatch(BaseModel):
    source_url: str = Field(..., max_length=1000)
    endpoint: str = Field(..., max_length=255)
    items: list[dict[str, Any]] = Field(default_factory=list)
    session_id: int | None = Field(
        default=None, description="Tag batch vào 1 phiên autoscan để xem lịch sử"
    )


class IngestResult(BaseModel):
    endpoint: str
    received: int
    upserted_products: int
    upserted_shops: int
    upserted_categories: int
    skipped: int
    errors: list[str] = Field(default_factory=list)


class StatsResponse(BaseModel):
    products_total: int
    shops_total: int
    categories_total: int
    crawl_log_total: int
    last_batches: list[dict[str, Any]]


class ProductBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None = None
    shop_id: int | None = None
    category_id: int | None = None
    price: int | None = None
    price_min: int | None = None
    price_max: int | None = None
    currency: str | None = None
    stock: int | None = None
    sold: int | None = None
    historical_sold: int | None = None
    liked_count: int | None = None
    rating_avg: float | None = None
    rating_count: int | None = None
    image: str | None = None
    brand: str | None = None
    location: str | None = None
    first_seen_at: datetime | None = None
    last_seen_at: datetime | None = None


class ShopBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None = None
    location: str | None = None
    rating: float | None = None
    follower_count: int | None = None


class CategoryBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None = None
    parent_id: int | None = None
    level: int | None = None


class CategoryWithCount(CategoryBrief):
    product_count: int = 0


class ProductDetail(ProductBrief):
    images_json: list[Any] | None = None
    raw_json: dict[str, Any] | None = None
    shop: ShopBrief | None = None
    category: CategoryBrief | None = None


class ProductListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[ProductBrief]


class CrawlSessionCreate(BaseModel):
    keyword: str = Field(..., max_length=500)
    source: str = Field(default="autoscan", max_length=32)
    tab_url: str | None = Field(default=None, max_length=1000)
    max_scrolls: int | None = Field(default=None, ge=1, le=10000)


class CrawlSessionUpdate(BaseModel):
    status: str | None = Field(default=None, max_length=32)
    reason: str | None = Field(default=None, max_length=64)
    scroll_ticks: int | None = Field(default=None, ge=0)
    items_seen: int | None = Field(default=None, ge=0)
    finished: bool | None = Field(
        default=None, description="Nếu true → set finished_at = now"
    )


class CrawlSessionBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    keyword: str | None = None
    source: str | None = None
    tab_url: str | None = None
    max_scrolls: int | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    status: str | None = None
    reason: str | None = None
    scroll_ticks: int = 0
    items_seen: int = 0
    products_upserted: int = 0


class CrawlSessionListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[CrawlSessionBrief]
