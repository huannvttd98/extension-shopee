from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import StatsResponse

router = APIRouter()


@router.get("/stats", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    products_total = db.execute(text("SELECT COUNT(*) FROM products")).scalar() or 0
    shops_total = db.execute(text("SELECT COUNT(*) FROM shops")).scalar() or 0
    categories_total = db.execute(text("SELECT COUNT(*) FROM categories")).scalar() or 0
    crawl_log_total = db.execute(text("SELECT COUNT(*) FROM crawl_log")).scalar() or 0

    rows = db.execute(
        text(
            "SELECT id, endpoint, source_url, items_count, received_at "
            "FROM crawl_log ORDER BY id DESC LIMIT 20"
        )
    ).mappings().all()

    return StatsResponse(
        products_total=products_total,
        shops_total=shops_total,
        categories_total=categories_total,
        crawl_log_total=crawl_log_total,
        last_batches=[dict(r) for r in rows],
    )
