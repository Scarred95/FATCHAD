# app/routes/health.py
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from shared.db.ddb import catalog_table
from shared.db.keys import catalog_pointer_key

router = APIRouter(tags=["meta"])


@router.get("/healthz")
def healthz():
    """Liveness + DDB reachability check.

    Returns 200 when the catalog table is reachable AND has a published
    pointer; 503 otherwise — so load balancers / API Gateway health checks
    drop the instance out of rotation correctly.

    The pointer read doubles as a "catalog is published" check: a freshly
    deployed stack with no publish yet will report degraded, which is the
    correct signal (gameplay can't function without one).
    """
    try:
        item = catalog_table().get_item(Key=catalog_pointer_key()).get("Item")
        db_ok = item is not None
    except Exception:
        db_ok = False

    body = {"status": "ok" if db_ok else "degraded", "db": db_ok}
    return JSONResponse(content=body, status_code=200 if db_ok else 503)
