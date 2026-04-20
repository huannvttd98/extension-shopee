from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..schemas import IngestBatch, IngestResult
from ..services.ingest_service import ingest_batch

router = APIRouter()


@router.post("/ingest", response_model=IngestResult)
def post_ingest(batch: IngestBatch, db: Session = Depends(get_db)):
    if len(batch.items) > settings.ingest_max_batch:
        raise HTTPException(
            status_code=413,
            detail=f"batch too large (>{settings.ingest_max_batch})",
        )
    return ingest_batch(db, batch.source_url, batch.endpoint, batch.items)
