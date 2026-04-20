from typing import Any

from pydantic import BaseModel, Field


class IngestBatch(BaseModel):
    source_url: str = Field(..., max_length=1000)
    endpoint: str = Field(..., max_length=255)
    items: list[dict[str, Any]] = Field(default_factory=list)


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
