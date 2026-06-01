"""Admin route bundle — cards, endings, publish, all gated by the bearer token.

The parent `/admin` router applies `require_admin_token` once, so every
sub-router below inherits the gate without per-route boilerplate.
"""
from fastapi import APIRouter, Depends

from shared.auth import require_admin_token, router as auth_router

from admin_lambda.routes import cards, endings, publish

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin_token)],
)

router.include_router(cards.router, prefix="/cards")
router.include_router(endings.router, prefix="/endings")
router.include_router(publish.router, prefix="/publish")
router.include_router(auth_router, prefix="/auth")
