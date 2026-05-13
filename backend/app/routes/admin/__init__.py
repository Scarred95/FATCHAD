# app/routes/admin/__init__.py
"""Admin router — mounts card CRUD and debug deck tools under /admin."""
from fastapi import APIRouter

from app.routes.admin import cards, debug

router = APIRouter(prefix="/admin", tags=["admin"])

router.include_router(cards.router, prefix="/cards")
router.include_router(debug.router)
