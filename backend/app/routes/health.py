# app/routes/health.py
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(tags=["meta"])


@router.get("/healthz")
async def healthz(request: Request):
    """Liveness + DB reachability check.

    Returns 200 when Mongo is reachable, 503 when it isn't — so load
    balancers and readiness probes that inspect only the status code
    correctly drop the instance out of rotation.
    """
    db_ok = await request.app.state.mongo.ping()
    body = {"status": "ok" if db_ok else "degraded", "db": db_ok}
    return JSONResponse(content=body, status_code=200 if db_ok else 503)
