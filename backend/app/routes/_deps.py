# app/routes/_deps.py
"""Shared FastAPI dependency providers.

Single source of truth for repo / snapshot construction. The factories are
trivially cheap (boto3 singletons inside ddb.py do the real caching), so
re-creating them per request keeps the routes simple — no app.state plumbing.
"""
from shared.db.catalog_repo import CatalogRepo
from shared.db.catalog_snapshot import CatalogSnapshot, get_current_snapshot
from shared.db.user_repo import UserRepo


def get_user_repo() -> UserRepo:
    return UserRepo()


def get_catalog_repo() -> CatalogRepo:
    """Admin-side: direct DDB access for catalog CRUD."""
    return CatalogRepo()


def get_catalog() -> CatalogSnapshot:
    """Gameplay-side: cached in-memory snapshot of the published catalog.

    Pointer-version checked on every call; S3 refetch only on bump. See
    catalog_snapshot.get_current_snapshot for the cost breakdown.
    """
    return get_current_snapshot()
