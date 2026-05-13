# app/routes/health.py
from fastapi import APIRouter, Request

router = APIRouter(tags=["meta"])


@router.get("/healthz")
async def healthz(request: Request):
    """Liveness + DB reachability check."""
    db_ok = await request.app.state.mongo.ping()
    return {"status": "ok" if db_ok else "degraded", "db": db_ok}
