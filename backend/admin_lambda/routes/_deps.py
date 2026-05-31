"""Admin-side dependency providers.

The admin surface only ever needs the working-copy CatalogRepo — it never
reads the published snapshot (that's a gameplay-side concern). Kept as a
tiny dedicated module rather than pulling in gameplay's _deps so the
admin Lambda doesn't drag CatalogSnapshot's S3 dependency into its code path.
"""
from shared.db.catalog_repo import CatalogRepo


def get_catalog_repo() -> CatalogRepo:
    return CatalogRepo()
