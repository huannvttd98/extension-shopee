from __future__ import annotations

import json
import logging
from typing import Any, Iterable

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..schemas import IngestResult

logger = logging.getLogger(__name__)


PRODUCT_COLUMNS = [
    "id",
    "shop_id",
    "category_id",
    "name",
    "price",
    "price_min",
    "price_max",
    "currency",
    "stock",
    "sold",
    "historical_sold",
    "liked_count",
    "rating_avg",
    "rating_count",
    "image",
    "images_json",
    "brand",
    "location",
    "raw_json",
]

PRODUCT_UPDATE_COLS = [c for c in PRODUCT_COLUMNS if c != "id"]


def _as_int(v: Any) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _as_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _extract_items(endpoint: str, items: list[dict]) -> list[dict]:
    """
    Shopee wraps product data differently per endpoint.
    Normalize to a flat list of "item_basic"-shaped dicts.
    """
    endpoint = (endpoint or "").lower()
    out: list[dict] = []

    for wrapper in items:
        if not isinstance(wrapper, dict):
            continue

        if "item_basic" in wrapper and isinstance(wrapper["item_basic"], dict):
            out.append(wrapper["item_basic"])
            continue

        if "data" in wrapper and isinstance(wrapper["data"], dict):
            data = wrapper["data"]
            if "item" in data and isinstance(data["item"], dict):
                out.append(data["item"])
                continue
            if "items" in data and isinstance(data["items"], list):
                for sub in data["items"]:
                    if isinstance(sub, dict):
                        basic = sub.get("item_basic") if "item_basic" in sub else sub
                        if isinstance(basic, dict):
                            out.append(basic)
                continue

        if "itemid" in wrapper or "item_id" in wrapper:
            out.append(wrapper)

    return out


def _normalize_product(raw: dict) -> dict | None:
    itemid = _as_int(raw.get("itemid") or raw.get("item_id"))
    if not itemid:
        return None

    shopid = _as_int(raw.get("shopid") or raw.get("shop_id"))
    catid = _as_int(raw.get("catid") or raw.get("category_id"))

    name = raw.get("name") or raw.get("title")
    if isinstance(name, str):
        name = name[:500]

    price = _as_int(raw.get("price"))
    price_min = _as_int(raw.get("price_min"))
    price_max = _as_int(raw.get("price_max"))

    stock = _as_int(raw.get("stock"))
    sold = _as_int(raw.get("sold"))
    historical_sold = _as_int(raw.get("historical_sold"))
    liked_count = _as_int(raw.get("liked_count") or raw.get("like_count"))

    rating_avg = None
    rating_count = None
    item_rating = raw.get("item_rating")
    if isinstance(item_rating, dict):
        rating_avg = _as_float(item_rating.get("rating_star"))
        rc = item_rating.get("rating_count")
        if isinstance(rc, list) and rc:
            rating_count = _as_int(rc[0])
        else:
            rating_count = _as_int(rc)

    image = raw.get("image")
    if isinstance(image, str):
        image = image[:255]
    images = raw.get("images")
    if not isinstance(images, list):
        images = None

    brand = raw.get("brand")
    if isinstance(brand, str):
        brand = brand[:128]
    location = raw.get("shop_location") or raw.get("location")
    if isinstance(location, str):
        location = location[:128]

    return {
        "id": itemid,
        "shop_id": shopid,
        "category_id": catid,
        "name": name,
        "price": price,
        "price_min": price_min,
        "price_max": price_max,
        "currency": raw.get("currency") or "VND",
        "stock": stock,
        "sold": sold,
        "historical_sold": historical_sold,
        "liked_count": liked_count,
        "rating_avg": rating_avg,
        "rating_count": rating_count,
        "image": image,
        "images_json": json.dumps(images) if images is not None else None,
        "brand": brand,
        "location": location,
        "raw_json": json.dumps(raw, ensure_ascii=False),
    }


def _collect_shops(normalized: Iterable[dict], raw_items: list[dict]) -> list[dict]:
    # Try to collect shop info from raw items (shop_location, shop_rating may be absent)
    seen: dict[int, dict] = {}
    for n, raw in zip(normalized, raw_items):
        sid = n.get("shop_id")
        if not sid or sid in seen:
            continue
        seen[sid] = {
            "id": sid,
            "name": raw.get("shop_name") or raw.get("username"),
            "location": raw.get("shop_location") or raw.get("location"),
            "rating": _as_float(raw.get("shop_rating")),
            "follower_count": _as_int(raw.get("shop_follower_count")),
            "raw_json": None,
        }
    return list(seen.values())


def _collect_categories(normalized: Iterable[dict]) -> list[dict]:
    seen: dict[int, dict] = {}
    for n in normalized:
        cid = n.get("category_id")
        if not cid or cid in seen:
            continue
        seen[cid] = {"id": cid, "name": None, "parent_id": None, "level": None, "raw_json": None}
    return list(seen.values())


def _bulk_upsert_products(db: Session, rows: list[dict]) -> int:
    if not rows:
        return 0
    cols = ", ".join(PRODUCT_COLUMNS)
    placeholders = ", ".join(f":{c}" for c in PRODUCT_COLUMNS)
    updates = ", ".join(f"{c}=VALUES({c})" for c in PRODUCT_UPDATE_COLS)
    sql = text(
        f"INSERT INTO products ({cols}) VALUES ({placeholders}) "
        f"ON DUPLICATE KEY UPDATE {updates}"
    )
    db.execute(sql, rows)
    return len(rows)


def _bulk_upsert_shops(db: Session, rows: list[dict]) -> int:
    if not rows:
        return 0
    sql = text(
        "INSERT INTO shops (id, name, location, rating, follower_count, raw_json) "
        "VALUES (:id, :name, :location, :rating, :follower_count, :raw_json) "
        "ON DUPLICATE KEY UPDATE "
        "name=COALESCE(VALUES(name), name), "
        "location=COALESCE(VALUES(location), location), "
        "rating=COALESCE(VALUES(rating), rating), "
        "follower_count=COALESCE(VALUES(follower_count), follower_count)"
    )
    db.execute(sql, rows)
    return len(rows)


def _bulk_upsert_categories(db: Session, rows: list[dict]) -> int:
    if not rows:
        return 0
    sql = text(
        "INSERT INTO categories (id, name, parent_id, level, raw_json) "
        "VALUES (:id, :name, :parent_id, :level, :raw_json) "
        "ON DUPLICATE KEY UPDATE id=id"
    )
    db.execute(sql, rows)
    return len(rows)


def _log_crawl(db: Session, endpoint: str, source_url: str, items_count: int) -> None:
    db.execute(
        text(
            "INSERT INTO crawl_log (endpoint, source_url, items_count) "
            "VALUES (:endpoint, :source_url, :items_count)"
        ),
        {
            "endpoint": endpoint[:255],
            "source_url": (source_url or "")[:1000],
            "items_count": items_count,
        },
    )


def _tag_session(db: Session, session_id: int, product_ids: list[int]) -> None:
    """Ghi mapping product ↔ session, bỏ qua row đã tồn tại (cùng SP bị đẩy nhiều batch)."""
    if not product_ids:
        return
    rows = [{"pid": pid, "sid": session_id} for pid in product_ids]
    db.execute(
        text(
            "INSERT IGNORE INTO product_crawl_sessions (product_id, session_id) "
            "VALUES (:pid, :sid)"
        ),
        rows,
    )
    # Cập nhật counter tổng của session.
    db.execute(
        text(
            "UPDATE crawl_sessions "
            "SET products_upserted = products_upserted + :n, "
            "    items_seen = items_seen + :n "
            "WHERE id = :sid"
        ),
        {"n": len(product_ids), "sid": session_id},
    )


def ingest_batch(
    db: Session,
    source_url: str,
    endpoint: str,
    items: list[dict],
    session_id: int | None = None,
) -> IngestResult:
    errors: list[str] = []

    raw_items = _extract_items(endpoint, items)

    normalized: list[dict] = []
    skipped = 0
    for raw in raw_items:
        try:
            n = _normalize_product(raw)
        except Exception as e:
            errors.append(f"normalize: {e}")
            continue
        if n is None:
            skipped += 1
            continue
        normalized.append(n)

    shops = _collect_shops(normalized, raw_items)
    categories = _collect_categories(normalized)

    try:
        n_shops = _bulk_upsert_shops(db, shops)
        n_cats = _bulk_upsert_categories(db, categories)
        n_prods = _bulk_upsert_products(db, normalized)
        _log_crawl(db, endpoint, source_url, n_prods)
        if session_id and normalized:
            _tag_session(db, session_id, [n["id"] for n in normalized])
        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception("ingest batch failed")
        errors.append(f"db: {e}")
        return IngestResult(
            endpoint=endpoint,
            received=len(items),
            upserted_products=0,
            upserted_shops=0,
            upserted_categories=0,
            skipped=skipped,
            errors=errors,
        )

    return IngestResult(
        endpoint=endpoint,
        received=len(items),
        upserted_products=n_prods,
        upserted_shops=n_shops,
        upserted_categories=n_cats,
        skipped=skipped,
        errors=errors,
    )
