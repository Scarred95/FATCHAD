"""Public catalog endpoint.

Serves the player-safe catalog bundle (catalog_public.json) the SPA renders
from. We proxy it through the Lambda instead of exposing the bucket: the
catalog bucket is BlockPublicAccess.BLOCK_ALL, and the Lambda already has
S3 GetObject on it (the engine reads catalog_full.json), so this is zero extra
IAM and keeps the bucket private.

Caching (per warm container): the public bundle bytes are cached and keyed by
the pointer version. The pointer is re-checked at most every CACHE_TTL_SECONDS;
S3 is refetched only when the version actually changes. A publish therefore
propagates within the TTL without any cross-container coordination.
"""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, HTTPException, Response

from shared.db.ddb import catalog_bucket, catalog_table, s3_client
from shared.db.keys import catalog_pointer_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/catalog", tags=["catalog"])

# How long to trust the cached bundle before re-reading the pointer. Trades up
# to this much publish-propagation lag for fewer DDB reads under load.
CACHE_TTL_SECONDS = 30

# Module-global cache. Reset on cold start.
_cached_version: str | None = None
_cached_body: bytes | None = None
_checked_at: float = 0.0


def _load_public_bundle() -> tuple[str, bytes]:
    """Return (version, raw bytes) of the live public bundle, cached per
    container. Skips the pointer read while within the TTL; refetches S3 only
    when the version changes."""
    global _cached_version, _cached_body, _checked_at

    now = time.monotonic()
    if _cached_body is not None and (now - _checked_at) < CACHE_TTL_SECONDS:
        return _cached_version, _cached_body  # type: ignore[return-value]

    pointer_item = catalog_table().get_item(Key=catalog_pointer_key()).get("Item")
    if pointer_item is None:
        raise HTTPException(
            status_code=503,
            detail="Catalog not yet published. The admin needs to run a publish.",
        )
    version = pointer_item["version"]
    _checked_at = now

    if _cached_body is not None and _cached_version == version:
        return version, _cached_body

    bundle_key = f"v{version}/catalog_public.json"
    try:
        obj = s3_client().get_object(Bucket=catalog_bucket(), Key=bundle_key)
        body = obj["Body"].read()
    except Exception as e:
        # Log internals server-side; don't leak boto/S3 error text to clients.
        logger.exception("Catalog bundle %r not retrievable", bundle_key)
        raise HTTPException(
            status_code=502,
            detail="Published catalog bundle is currently unavailable.",
        ) from e

    _cached_version, _cached_body = version, body
    return version, body


@router.get("/current")
def get_current_catalog() -> Response:
    """Return the currently-published public bundle verbatim, with a 5-minute
    browser cache. `X-Catalog-Version` lets clients skip the parse when nothing
    changed. 503 if nothing's published yet; 502 if the bundle key is gone."""
    version, body = _load_public_bundle()
    return Response(
        content=body,
        media_type="application/json",
        headers={
            "Cache-Control": "public, max-age=300",
            "X-Catalog-Version": str(version),
        },
    )
