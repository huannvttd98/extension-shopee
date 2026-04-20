from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Category, Product
from ..schemas import CategoryWithCount

router = APIRouter()


@router.get("/categories", response_model=list[CategoryWithCount])
def list_categories(
    db: Session = Depends(get_db),
    non_empty: bool = Query(True, description="Chỉ trả category có ít nhất 1 product"),
):
    stmt = (
        select(
            Category.id,
            Category.name,
            Category.parent_id,
            Category.level,
            func.count(Product.id).label("product_count"),
        )
        .outerjoin(Product, Product.category_id == Category.id)
        .group_by(Category.id, Category.name, Category.parent_id, Category.level)
        .order_by(func.count(Product.id).desc(), Category.id.asc())
    )
    rows = db.execute(stmt).all()

    items = []
    for r in rows:
        if non_empty and (r.product_count or 0) == 0:
            continue
        items.append(
            CategoryWithCount(
                id=r.id,
                name=r.name,
                parent_id=r.parent_id,
                level=r.level,
                product_count=int(r.product_count or 0),
            )
        )
    return items
