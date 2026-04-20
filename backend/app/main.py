import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import ingest, products, scan_sessions, stats

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(title="ProductMap Ingest API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router, prefix="/api", tags=["ingest"])
app.include_router(products.router, prefix="/api", tags=["products"])
app.include_router(scan_sessions.router, prefix="/api", tags=["scan-sessions"])
app.include_router(stats.router, prefix="/api", tags=["stats"])


@app.get("/healthz")
def healthz():
    return {"status": "ok"}
