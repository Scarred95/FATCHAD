"""Authentication — Cognito JWT verification (production) with legacy
bearer-token fallback for local dev.

Production flow (COGNITO_USER_POOL_ID is set):
  1. Client logs in via Cognito and receives a JWT access token.
  2. Every request carries:  Authorization: Bearer <jwt>
  3. verify_token() fetches Cognito's public keys (JWKS) once per Lambda
     container, then verifies the JWT signature + expiry on every call.
  4. The token's `sub` claim becomes the user_id throughout the app.
  5. Admin routes additionally check `cognito:groups` contains "admin".

Local dev fallback (COGNITO_USER_POOL_ID is NOT set):
  - Admin routes still accept the hardcoded ADMIN_TOKEN bearer token.
  - Gameplay routes derive user_id from the ?user_id= query param as before.
  This keeps `.\start.ps1` working without a deployed Cognito stack.
"""
from __future__ import annotations

import json
import logging
import os
import secrets
import urllib.request
from functools import lru_cache
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# Dev-mode admin token (unchanged from the old placeholder)
# ---------------------------------------------------------------------------

_DEFAULT_DEV_TOKEN = "dev-admin-token-change-me"
_ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", _DEFAULT_DEV_TOKEN)

if _ADMIN_TOKEN == _DEFAULT_DEV_TOKEN:
    logger.warning(
        "ADMIN_TOKEN env var not set — using the bundled dev default "
        "(%r). Set ADMIN_TOKEN before deploying anywhere reachable from "
        "the internet.",
        _DEFAULT_DEV_TOKEN,
    )


# ---------------------------------------------------------------------------
# Cognito JWKS — fetched once per Lambda container, cached in RAM
# ---------------------------------------------------------------------------

def _cognito_configured() -> bool:
    return bool(os.getenv("COGNITO_USER_POOL_ID"))


@lru_cache(maxsize=1)
def _fetch_jwks(jwks_url: str) -> dict:
    """Download and cache Cognito's public signing keys."""
    with urllib.request.urlopen(jwks_url, timeout=5) as resp:
        return json.loads(resp.read())


def _jwks() -> dict:
    pool_id = os.environ["COGNITO_USER_POOL_ID"]
    region = os.getenv("COGNITO_REGION", "eu-central-1")
    url = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json"
    return _fetch_jwks(url)


# ---------------------------------------------------------------------------
# JWT verification
# ---------------------------------------------------------------------------

def verify_token(token: str) -> dict:
    """Verify a Cognito JWT and return its claims.

    Raises HTTP 401 if the token is missing, expired, or has an invalid
    signature. Uses the cached JWKS so the S3-hosted public key is only
    fetched once per warm Lambda container.
    """
    pool_id = os.environ["COGNITO_USER_POOL_ID"]
    region = os.getenv("COGNITO_REGION", "eu-central-1")
    issuer = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}"

    try:
        claims = jwt.decode(
            token,
            _jwks(),
            algorithms=["RS256"],
            issuer=issuer,
            # Cognito access tokens use `client_id` instead of `aud` —
            # skip the audience check here; the issuer check is sufficient.
            options={"verify_aud": False},
        )
        return claims
    except JWTError as exc:
        raise _unauthorized(str(exc))


# ---------------------------------------------------------------------------
# Shared dependencies
# ---------------------------------------------------------------------------

def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """Verify the JWT and return its full claims dict.

    Used as a base for `get_current_user_id` and `require_admin`.
    Raises 401 if no token is provided or verification fails.
    """
    if creds is None:
        raise _unauthorized("Missing Authorization header")
    return verify_token(creds.credentials)


def get_current_user_id(
    claims: dict = Depends(get_current_user),
) -> str:
    """Return the Cognito user's unique ID (the `sub` claim).

    Drop-in replacement for the ?user_id= query param once Cognito is live.
    """
    return claims["sub"]


def require_admin(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> None:
    """Reject the request unless the caller has admin rights.

    Production: verifies JWT and checks the caller is in the `admin` group.
    Local dev (no COGNITO_USER_POOL_ID): falls back to the legacy ADMIN_TOKEN
    bearer-token check so `.\start.ps1` keeps working.
    """
    if not _cognito_configured():
        # --- Legacy dev fallback ---
        if creds is None:
            raise _unauthorized("Missing Authorization header")
        if creds.scheme.lower() != "bearer":
            raise _unauthorized(f"Expected Bearer scheme, got {creds.scheme!r}")
        if not secrets.compare_digest(creds.credentials, _ADMIN_TOKEN):
            raise _unauthorized("Invalid admin token")
        return

    # --- Cognito path ---
    claims = get_current_user(creds)
    groups: list[str] = claims.get("cognito:groups", [])
    if "admin" not in groups:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin group membership required",
        )


# ---------------------------------------------------------------------------
# Admin auth ping endpoint (unchanged)
# ---------------------------------------------------------------------------

router = APIRouter()


@router.get("/ping")
async def ping() -> dict[str, bool]:
    """Token-validation heartbeat — guarded by require_admin at the parent router.

    200 → credentials valid, mount the admin UI.
    401/403 → credentials invalid, show the login screen.
    """
    return {"ok": True}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )
