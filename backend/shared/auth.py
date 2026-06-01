"""Admin auth — a single shared bearer token from the ADMIN_TOKEN env var.

Placeholder layer: no user accounts, no hashing (the token IS the secret), no
sessions/rotation. Every /admin/* route runs `require_admin_token`; the
frontend pings /admin/auth/ping to check a stored token. Swap for real auth
before exposing admin on the public internet.
"""
from __future__ import annotations

import logging
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

log = logging.getLogger(__name__)

# Clearly-marked dev default so `uvicorn ...` works without env setup; the
# warning below fires if it's ever live. Read at import time is fine — env vars
# are set before the process starts (move into startup if you adopt runtime dotenv).
_DEFAULT_DEV_TOKEN = "dev-admin-token-change-me"
_ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", _DEFAULT_DEV_TOKEN)

if _ADMIN_TOKEN == _DEFAULT_DEV_TOKEN:
    log.warning(
        "ADMIN_TOKEN env var not set — using the bundled dev default (%r). "
        "Set ADMIN_TOKEN before deploying anywhere reachable from the internet.",
        _DEFAULT_DEV_TOKEN,
    )

# auto_error=False: we handle the missing/invalid case ourselves to return a
# 401 + WWW-Authenticate challenge (the default is a bare 403, no challenge).
_bearer_scheme = HTTPBearer(auto_error=False)


def require_admin_token(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> None:
    """Reject the request unless a valid admin token is in the Authorization
    header. Mounted at the /admin router so every route is guarded. Raises 401
    on any failure; returns None on success.
    """
    if creds is None:
        raise _unauthorized("Missing Authorization header")

    # Load-bearing: with auto_error=False, HTTPBearer returns creds even for a
    # non-Bearer scheme, so we check it explicitly (case-insensitive).
    if creds.scheme.lower() != "bearer":
        raise _unauthorized(f"Expected Bearer scheme, got {creds.scheme!r}")

    # Constant-time compare so response timing can't leak the token byte-by-byte.
    if not secrets.compare_digest(creds.credentials, _ADMIN_TOKEN):
        raise _unauthorized("Invalid admin token")


def _unauthorized(detail: str) -> HTTPException:
    """Canonical 401. The WWW-Authenticate header tells the client which scheme
    to use — without it some clients won't even prompt for credentials."""
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


# Tiny sub-router so the frontend can cheaply validate a stored token.
router = APIRouter()


@router.get("/ping")
async def ping() -> dict[str, bool]:
    """Token-validation heartbeat: 200 (guarded by require_admin_token) means
    the token is valid and the admin UI may mount; 401 means clear it."""
    return {"ok": True}
