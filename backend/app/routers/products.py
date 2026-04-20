from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Category, Product, Shop
from ..schemas import (
    CategoryBrief,
    ProductBrief,
    ProductDetail,
    ProductListResponse,
    ShopBrief,
)

router = APIRouter()

SORT_FIELDS = {
    "last_seen_at": Product.last_seen_at,
    "first_seen_at": Product.first_seen_at,
    "price": Product.price,
    "sold": Product.sold,
    "historical_sold": Product.historical_sold,
    "rating_avg": Product.rating_avg,
    "liked_count": Product.liked_count,
}


@router.get("/products", response_model=ProductListResponse)
def list_products(
    db: Session = Depends(get_db),
    q: Optional[str] = Query(None, max_length=200, description="Tìm theo tên sản phẩm (LIKE)"),
    shop_id: Optional[int] = Query(None),
    category_id: Optional[int] = Query(None),
    min_price: Optional[int] = Query(None, ge=0),
    max_price: Optional[int] = Query(None, ge=0),
    sort: str = Query("last_seen_at", description=f"Field sort: {', '.join(SORT_FIELDS)}"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    if sort not in SORT_FIELDS:
        raise HTTPException(
            status_code=400,
            detail=f"invalid sort '{sort}', allowed: {list(SORT_FIELDS)}",
        )

    conditions = []
    if q:
        conditions.append(Product.name.like(f"%{q}%"))
    if shop_id is not None:
        conditions.append(Product.shop_id == shop_id)
    if category_id is not None:
        conditions.append(Product.category_id == category_id)
    if min_price is not None:
        conditions.append(Product.price >= min_price)
    if max_price is not None:
        conditions.append(Product.price <= max_price)

    stmt = select(Product)
    count_stmt = select(func.count()).select_from(Product)
    for cond in conditions:
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    sort_col = SORT_FIELDS[sort]
    stmt = stmt.order_by(sort_col.desc() if order == "desc" else sort_col.asc())
    stmt = stmt.limit(limit).offset(offset)

    rows = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar() or 0

    return ProductListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[ProductBrief.model_validate(p) for p in rows],
    )


@router.get("/products/{product_id}", response_model=ProductDetail)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="product not found")

    shop = db.get(Shop, product.shop_id) if product.shop_id is not None else None
    category = (
        db.get(Category, product.category_id) if product.category_id is not None else None
    )

    detail = ProductDetail.model_validate(product)
    detail.shop = ShopBrief.model_validate(shop) if shop else None
    detail.category = CategoryBrief.model_validate(category) if category else None
    return detail
