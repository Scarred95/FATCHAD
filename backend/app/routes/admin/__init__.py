# app/routes/admin/__init__.py
"""Admin router — mounts card / ending CRUD and the auth ping under `/admin`.

The whole subtree is guarded by `require_admin_token`, so every route
mounted below the parent router automatically requires a valid

    Authorization: Bearer <ADMIN_TOKEN>

header. See `shared.auth` for the full explanation of what's checked
and how. Adding a new admin sub-router here means it's protected by
default — no per-route auth boilerplate.
"""
from fastapi import APIRouter, Depends

from shared.auth import require_admin_token, router as auth_router

from app.routes.admin import cards, endings

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    # Router-level dependency: FastAPI runs it for every request below,
    # after the CORS middleware handles preflight (OPTIONS) and before
    # the route handler. If the dependency raises, the handler never
    # runs — that's how the gate works.
    dependencies=[Depends(require_admin_token)],
)

router.include_router(cards.router, prefix="/cards")
router.include_router(endings.router, prefix="/endings")
router.include_router(auth_router, prefix="/auth")
