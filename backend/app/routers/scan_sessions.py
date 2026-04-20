from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status as http_status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import CrawlSession, Product, ProductCrawlSession
from ..schemas import (
    CrawlSessionBrief,
    CrawlSessionCreate,
    CrawlSessionListResponse,
    CrawlSessionUpdate,
    ProductBrief,
    ProductListResponse,
)

router = APIRouter()

_ALLOWED_CREATE_STATUSES = {"queued", "running"}


@router.post("/scan-sessions", response_model=CrawlSessionBrief)
def create_session(payload: CrawlSessionCreate, db: Session = Depends(get_db)):
    req_status = (payload.status or "running").strip()
    if req_status not in _ALLOWED_CREATE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"invalid status '{req_status}', allowed: {sorted(_ALLOWED_CREATE_STATUSES)}",
        )

    session = CrawlSession(
        keyword=payload.keyword.strip()[:500],
        source=payload.source or "autoscan",
        tab_url=(payload.tab_url or None),
        max_scrolls=payload.max_scrolls,
        status=req_status,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return CrawlSessionBrief.model_validate(session)


@router.post("/scan-sessions/claim")
def claim_session(response: Response, db: Session = Depends(get_db)):
    """Extension gọi để lấy 1 job queued cũ nhất, atomic chuyển sang running.

    Trả 204 nếu không có job nào.
    """
    stmt = (
        select(CrawlSession)
        .where(CrawlSession.status == "queued")
        .order_by(CrawlSession.id.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    session = db.execute(stmt).scalar_one_or_none()
    if session is None:
        response.status_code = http_status.HTTP_204_NO_CONTENT
        return None

    session.status = "running"
    session.started_at = func.current_timestamp()
    db.commit()
    db.refresh(session)
    return CrawlSessionBrief.model_validate(session).model_dump()


@router.patch("/scan-sessions/{session_id}", response_model=CrawlSessionBrief)
def update_session(
    session_id: int,
    payload: CrawlSessionUpdate,
    db: Session = Depends(get_db),
):
    session = db.get(CrawlSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")

    if payload.status is not None:
        session.status = payload.status[:32]
    if payload.reason is not None:
        session.reason = payload.reason[:64]
    if payload.scroll_ticks is not None:
        session.scroll_ticks = payload.scroll_ticks
    if payload.items_seen is not None:
        session.items_seen = payload.items_seen
    if payload.finished:
        session.finished_at = func.current_timestamp()

    db.commit()
    db.refresh(session)
    return CrawlSessionBrief.model_validate(session)


@router.get("/scan-sessions", response_model=CrawlSessionListResponse)
def list_sessions(
    db: Session = Depends(get_db),
    status: Optional[str] = Query(None, max_length=32),
    keyword: Optional[str] = Query(None, max_length=200),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    stmt = select(CrawlSession)
    count_stmt = select(func.count()).select_from(CrawlSession)

    conds = []
    if status:
        conds.append(CrawlSession.status == status)
    if keyword:
        conds.append(CrawlSession.keyword.like(f"%{keyword}%"))
    for c in conds:
        stmt = stmt.where(c)
        count_stmt = count_stmt.where(c)

    stmt = stmt.order_by(CrawlSession.id.desc()).limit(limit).offset(offset)
    rows = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar() or 0

    return CrawlSessionListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[CrawlSessionBrief.model_validate(s) for s in rows],
    )


@router.get("/scan-sessions/{session_id}", response_model=CrawlSessionBrief)
def get_session(session_id: int, db: Session = Depends(get_db)):
    session = db.get(CrawlSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
    return CrawlSessionBrief.model_validate(session)


@router.get(
    "/scan-sessions/{session_id}/products",
    response_model=ProductListResponse,
)
def list_session_products(
    session_id: int,
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    if db.get(CrawlSession, session_id) is None:
        raise HTTPException(status_code=404, detail="session not found")

    stmt = (
        select(Product)
        .join(
            ProductCrawlSession,
            ProductCrawlSession.product_id == Product.id,
        )
        .where(ProductCrawlSession.session_id == session_id)
        .order_by(ProductCrawlSession.first_seen_at.desc())
        .limit(limit)
        .offset(offset)
    )
    count_stmt = (
        select(func.count())
        .select_from(ProductCrawlSession)
        .where(ProductCrawlSession.session_id == session_id)
    )

    rows = db.execute(stmt).scalars().all()
    total = db.execute(count_stmt).scalar() or 0

    return ProductListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[ProductBrief.model_validate(p) for p in rows],
    )
