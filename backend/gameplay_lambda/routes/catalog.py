"""Public catalog endpoint.

Serves the player-safe catalog bundle that the frontend consumes to render
card art, deck names, ending blurbs, achievement labels — anything visible
in the UI before the engine has spoken.

Why a Lambda proxy instead of letting the SPA fetch S3 directly?
    The catalog bucket is `BlockPublicAccess.BLOCK_ALL` on purpose: it's
    the source of truth for the live game's content. Exposing it publicly
    means CORS + bucket-policy churn for every URL change. Funnelling the
    fetch through the gameplay Lambda costs ~5ms per cache-miss (one S3
    GetObject) and keeps the bucket boring-and-private.

    Lambda already needs S3 GetObject on this bucket (the engine reads
    catalog_full.json via CatalogSnapshot), so adding a public-bundle
    read is zero extra IAM.

Caching:
    - DDB pointer lookup: every call (small GetItem, single-digit ms).
    - S3 GetObject + parse: once per pointer-version per warm container.
    - HTTP Cache-Control: 5 minutes — the SPA holds onto the bundle even
      across a brief Lambda cold start, and a new publish invalidates by
      version (the response includes `version`, the SPA refetches if it
      doesn't match what it has).
"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Response

from shared.db.ddb import catalog_bucket, catalog_table, s3_client
from shared.db.keys import catalog_pointer_key


router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/current")
def get_current_catalog() -> Response:
    """Return the currently-published public catalog bundle verbatim.

    Response is the JSON written to `s3://fatchad-catalog/v<n>/catalog_public.json`,
    streamed through with a 5-minute browser cache header.

    Errors:
        503 — no catalog has been published yet (pointer item missing).
              The frontend can render an "under construction" state.
        502 — the pointer exists but the bundle key is gone. Means an
              admin deleted the S3 prefix manually; republish to fix.
    """
    pointer_item = catalog_table().get_item(Key=catalog_pointer_key()).get("Item")
    if pointer_item is None:
        raise HTTPException(
            status_code=503,
            detail="Catalog not yet published. The admin needs to run a publish.",
        )

    version = pointer_item["version"]
    bundle_key = f"v{version}/catalog_public.json"

    try:
        obj = s3_client().get_object(Bucket=catalog_bucket(), Key=bundle_key)
        body = obj["Body"].read()
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Catalog bundle {bundle_key!r} not retrievable: {e}",
        ) from e

    # Pass the bundle through as-is. It's already JSON; re-parsing and
    # re-serialising would burn CPU and risk subtle field-ordering drift
    # vs. what publisher.py wrote.
    return Response(
        content=body,
        media_type="application/json",
        headers={
            # 5-minute browser cache. Publish bumps the version inside the
            # body so the SPA can detect staleness even within the window;
            # Cache-Control just keeps the bandwidth bill down.
            "Cache-Control": "public, max-age=300",
            # Echo the version for clients that want to skip the JSON parse
            # when nothing has changed (HEAD requests, conditional fetches
            # if we add them later).
            "X-Catalog-Version": str(version),
        },
    )
