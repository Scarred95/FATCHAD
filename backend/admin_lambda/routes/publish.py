# admin_lambda/routes/publish.py
"""POST /admin/publish — snapshot the working catalog into a versioned bundle."""
from fastapi import APIRouter
from pydantic import BaseModel

from shared.db.publisher import publish_catalog
from shared.schemas import CatalogPointer

router = APIRouter()


class PublishRequest(BaseModel):
    """Optional explicit version label. None → mints a UTC timestamp.

    Pass `version="database-v7"` from CI to align bundle URLs with git tags.
    Admin UI "Publish now" leaves it empty.
    """
    version: str | None = None


@router.post("", response_model=CatalogPointer)
def publish(payload: PublishRequest | None = None) -> CatalogPointer:
    version = payload.version if payload else None
    return publish_catalog(version=version)


@router.get("/current", response_model=CatalogPointer | None)
def get_current_pointer() -> CatalogPointer | None:
    """What's live right now. Used by the admin UI badge ("you're editing
    1 ahead of v20260531...") and as the frontend bootstrap fetch on app load.

    Returns None before the first publish; the admin UI shows "never
    published" in that case.
    """
    from shared.db.catalog_repo import CatalogRepo
    return CatalogRepo().get_pointer()
