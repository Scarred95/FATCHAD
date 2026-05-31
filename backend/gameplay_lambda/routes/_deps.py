"""Gameplay-side dependency providers.

Gameplay never touches CatalogRepo (that's the admin/publish path) — it
reads the published snapshot via CatalogSnapshot's pointer-versioned cache.
"""
from shared.db.catalog_snapshot import CatalogSnapshot, get_current_snapshot
from shared.db.user_repo import UserRepo


def get_user_repo() -> UserRepo:
    return UserRepo()


def get_catalog() -> CatalogSnapshot:
    """Cached in-memory snapshot of the published catalog.

    Pointer-version checked on every call; S3 refetch only on bump. See
    catalog_snapshot.get_current_snapshot for the cost breakdown.
    """
    return get_current_snapshot()
