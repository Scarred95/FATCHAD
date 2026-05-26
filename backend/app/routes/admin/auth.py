"""
Admin authentication — a single shared bearer token kept in an env var.

This is a *placeholder* auth layer. It is intentionally simple while we
build out the admin tooling and is not yet linked to real users or hashed
passwords. Swap it out for proper user accounts before exposing the admin
surface on the public internet.

How it works (end-to-end):

  1. At startup, this module reads `ADMIN_TOKEN` from the environment.
     If the env var is unset, we fall back to a clearly-marked dev string
     so a developer can run the backend without ceremony — and we log a
     warning so nobody ships the default by accident.

  2. The frontend stores the token (the operator types it once into a
     login form) and attaches it to every admin request as a header:

         Authorization: Bearer <token>

  3. Every request under `/admin/*` runs the `require_admin_token`
     dependency below before the route handler is even called. That
     dependency:

         a) Looks for the `Authorization` header.
         b) Confirms the scheme part is literally "Bearer".
         c) Compares the supplied token against `ADMIN_TOKEN` using a
            constant-time comparison (`secrets.compare_digest`) so an
            attacker can't time-pattern guesses byte-by-byte.
         d) Raises HTTP 401 with the standard `WWW-Authenticate: Bearer`
            header on any failure. The frontend treats a 401 as "the
            token you have is no longer valid → kick the user back to
            the login screen".

  4. `GET /admin/auth/ping` is a no-op endpoint guarded by the same
     dependency. The frontend calls it on app boot to ask "is the token
     I have in localStorage still valid?". A 200 response means yes,
     mount the admin UI; a 401 means no, forget the token and show the
     login form.

What this layer deliberately does NOT do:

  - No password hashing (there are no passwords — the token IS the secret).
  - No per-user accounts. Anyone holding the token has full admin rights.
  - No session lifetime, rotation, or revocation.
  - No rate limiting on the ping endpoint.

  Real auth lands later, when we add a `users` collection and JWTs.
"""
from __future__ import annotations

import logging
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Token configuration
# ---------------------------------------------------------------------------

# A clearly-marked dev default so a developer can `uvicorn ...` without
# setting env vars first. The startup warning below makes it obvious if it
# ever ends up running in an environment that matters.
_DEFAULT_DEV_TOKEN = "dev-admin-token-change-me"

# Reading at module import time is fine because env vars are set before the
# server process starts. If you ever switch to dotenv loaded at runtime,
# move this read into a function called from app startup.
_ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", _DEFAULT_DEV_TOKEN)

if _ADMIN_TOKEN == _DEFAULT_DEV_TOKEN:
    log.warning(
        "ADMIN_TOKEN env var not set — using the bundled dev default "
        "(%r). Set ADMIN_TOKEN before deploying anywhere reachable from "
        "the internet.",
        _DEFAULT_DEV_TOKEN,
    )

# ---------------------------------------------------------------------------
# Bearer-scheme parser
# ---------------------------------------------------------------------------

# `HTTPBearer` is FastAPI's helper that:
#   - looks for an `Authorization` header
#   - confirms it starts with the "Bearer " scheme
#   - returns the parsed pieces as `HTTPAuthorizationCredentials`
#
# We pass auto_error=False because the default behaviour returns a generic
# 403 with no `WWW-Authenticate` header. We want to handle the
# missing/invalid case ourselves so we can return a proper 401 plus the
# Bearer challenge, which is the response browsers and API clients expect.
_bearer_scheme = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Dependency — the actual gate
# ---------------------------------------------------------------------------


def require_admin_token(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> None:
    """FastAPI dependency: reject the request unless a valid admin token
    is supplied in the Authorization header.

    Mounted at router level via `dependencies=[Depends(require_admin_token)]`
    on the `/admin` router (see __init__.py), so every route under
    `/admin/*` is automatically guarded — no per-handler boilerplate.

    Returns None on success. Raises HTTPException(401) on any failure.
    """
    # --- 1. Was a header supplied at all? --------------------------------
    # No header → no credentials. Reject with a 401 + Bearer challenge so
    # browsers / API clients know what scheme they should be using.
    if creds is None:
        raise _unauthorized("Missing Authorization header")

    # --- 2. Right scheme? ------------------------------------------------
    # HTTPBearer enforces the literal "Bearer" prefix during parsing, but
    # be defensive — header parsing is forgiving about case and a tiny
    # explicit check costs nothing.
    if creds.scheme.lower() != "bearer":
        raise _unauthorized(f"Expected Bearer scheme, got {creds.scheme!r}")

    # --- 3. Token matches? -----------------------------------------------
    # `secrets.compare_digest` runs in constant time relative to string
    # length — an attacker can't gain bit-by-bit information from response
    # timing the way they could with a naive `==`. The function safely
    # handles strings of differing lengths.
    if not secrets.compare_digest(creds.credentials, _ADMIN_TOKEN):
        raise _unauthorized("Invalid admin token")

    # All checks passed — request continues into the route handler.


def _unauthorized(detail: str) -> HTTPException:
    """Build the canonical 401 response.

    The `WWW-Authenticate` header is part of the HTTP spec for 401
    responses and tells the client which auth scheme to use. Without it
    some clients won't even prompt the user for credentials.
    """
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


# ---------------------------------------------------------------------------
# Tiny sub-router so the frontend can validate a stored token cheaply.
# ---------------------------------------------------------------------------

router = APIRouter()


@router.get("/ping")
async def ping() -> dict[str, bool]:
    """Token-validation heartbeat.

    This handler does nothing on its own — its only job is to be guarded
    by `require_admin_token` (applied at the parent admin router). A 200
    means "yes, the token you sent is valid; the admin UI may mount".
    A 401 means "no — clear local storage and send the user to the
    login screen".
    """
    return {"ok": True}
