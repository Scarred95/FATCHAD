"""Admin route bundle — cards, endings, publish, all gated by admin auth.

The parent `/admin` router applies `require_admin` once, so every
sub-router below inherits the gate without per-route boilerplate.
In production this checks the caller's Cognito `admin` group membership;
in local dev (no Cognito) it falls back to the legacy ADMIN_TOKEN bearer check.
"""
from fastapi import APIRouter, Depends

from shared.auth import require_admin, router as auth_router

from admin_lambda.routes import achievements, cards, endings, publish

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)

router.include_router(cards.router, prefix="/cards")
router.include_router(endings.router, prefix="/endings")
router.include_router(achievements.router, prefix="/achievements")
router.include_router(publish.router, prefix="/publish")
router.include_router(auth_router, prefix="/auth")
