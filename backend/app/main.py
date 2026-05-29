# app/main.py
import logging
import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.db.connection import make_connection_from_env
from app.db.repositories import ensure_indexes
from app.routes import health, runs, gameplay
from app.routes.admin import router as admin_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = make_connection_from_env()
    await conn.connect()
    # Idempotent — Mongo no-ops if the index already exists.
    await ensure_indexes(conn.db)
    app.state.mongo = conn
    try:
        yield
    finally:
        await conn.disconnect()


app = FastAPI(
    title="FATCHAD API",
    version="0.1.0",
    lifespan=lifespan,
)


# -----------------------------------------------------------------------------
# Request correlation IDs
# -----------------------------------------------------------------------------
# Every request gets an X-Request-ID — either echoed back from the client (so a
# frontend can stitch its own trace) or freshly minted. Stashed on request.state
# so route handlers / loggers can pick it up, and echoed in the response header.

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response


app.add_middleware(RequestIDMiddleware)


# -----------------------------------------------------------------------------
# CORS
# -----------------------------------------------------------------------------
# Comma-separated origins in CORS_ORIGINS, e.g. "http://localhost:5173,https://mygame.com"
_cors_origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

# Browsers reject `Access-Control-Allow-Origin: *` together with credentials.
# If the deployer asked for a wildcard, force credentials off rather than ship
# a broken CORS config that fails silently in the browser.
_allow_credentials = True
if "*" in _cors_origins:
    logger.warning(
        "CORS_ORIGINS contains '*' — disabling allow_credentials "
        "(browsers reject wildcard origin + credentials)."
    )
    _allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(runs.router)
app.include_router(gameplay.router)
app.include_router(admin_router)