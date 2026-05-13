# app/main.py
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.connection import make_connection_from_env
from app.db.repositories import ensure_indexes
from app.routes import health, runs, gameplay
from app.routes.admin import router as admin_router


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

# Comma-separated origins in CORS_ORIGINS, e.g. "http://localhost:5173,https://mygame.com"
_cors_origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(runs.router)
app.include_router(gameplay.router)
app.include_router(admin_router)