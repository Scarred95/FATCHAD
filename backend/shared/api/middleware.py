"""Shared HTTP middleware (CORS + request correlation) for all FastAPI apps.

Factored out so the admin, gameplay, and dev apps stay in lock-step.
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

    Reuses a client-supplied id (for trace stitching) or mints a hex uuid;
    stashed on request.state.request_id for loggers/handlers.
    """

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response


def install_middleware(app: FastAPI) -> None:
    """Apply request-id + CORS to a FastAPI app.

    CORS_ORIGINS is a comma-separated allow-list. A wildcard `*` forces
    credentials off, since browsers reject wildcard origin + credentials.
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
