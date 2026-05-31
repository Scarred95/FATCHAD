"""HTTP middleware shared by all FastAPI apps (admin, gameplay, dev).

Both Lambda apps and the dev_app combined app need the same CORS + request
correlation behaviour — factoring it out keeps them in lock-step instead of
drifting apart on copy-paste.
"""
from __future__ import annotations

import logging
import os
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

log = logging.getLogger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Stamp every request with an X-Request-ID, echoed in the response.

    If the client supplied one we keep it (lets the frontend stitch a trace);
    otherwise we mint a fresh hex uuid. Stashed on `request.state.request_id`
    so loggers and handlers can grab it without re-reading the header.
    """

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response


def install_middleware(app: FastAPI) -> None:
    """Apply request-id + CORS to a FastAPI app.

    CORS_ORIGINS env var is a comma-separated allow-list. The wildcard `*`
    case forces credentials off — the browser rejects wildcard origin +
    credentials together, so we don't ship a config that silently breaks.
    """
    app.add_middleware(RequestIDMiddleware)

    origins = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if o.strip()
    ]
    allow_credentials = True
    if "*" in origins:
        log.warning(
            "CORS_ORIGINS contains '*' — disabling allow_credentials "
            "(browsers reject wildcard origin + credentials)."
        )
        allow_credentials = False

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )
