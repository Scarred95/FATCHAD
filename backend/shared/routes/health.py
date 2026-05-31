"""GET /healthz — liveness + DDB reachability.

Mounted by both Lambda apps so API Gateway / load-balancer health checks
can target either one independently and drop a broken instance out of
rotation without taking the other surface down with it.
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from shared.db.ddb import catalog_table
from shared.db.keys import catalog_pointer_key

router = APIRouter(tags=["meta"])


@router.get("/healthz")
def healthz():
    """200 when the catalog table is reachable AND has a published pointer.

    The pointer read doubles as a "catalog is published" check: a freshly
    deployed stack with no publish yet reports degraded, which is the
    correct signal (gameplay can't function without one).
    """
    try:
        item = catalog_table().get_item(Key=catalog_pointer_key()).get("Item")
        db_ok = item is not None
    except Exception:
        db_ok = False

    body = {"status": "ok" if db_ok else "degraded", "db": db_ok}
    return JSONResponse(content=body, status_code=200 if db_ok else 503)
