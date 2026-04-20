import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routers import categories, ingest, products, scan_sessions, stats

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
app.include_router(categories.router, prefix="/api", tags=["categories"])
app.include_router(scan_sessions.router, prefix="/api", tags=["scan-sessions"])
app.include_router(stats.router, prefix="/api", tags=["stats"])


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


# PWA viewer — mount nếu đã build (backend/webapp/dist/).
# Dev local: có thể chạy `npm run dev` trong backend/webapp/ để dùng vite dev server riêng.
_WEBAPP_DIST = Path(__file__).resolve().parent.parent / "webapp" / "dist"
if _WEBAPP_DIST.is_dir():
    app.mount("/app", StaticFiles(directory=_WEBAPP_DIST, html=True), name="webapp")
else:
    logging.getLogger(__name__).info(
        "webapp/dist not built; skipping /app mount. Run `npm run build` in backend/webapp/."
    )
