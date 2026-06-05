"""Gameplay FastAPI app — run lifecycle + active game loop.

Used both by handler.py (Mangum-wrapped for Lambda) and by dev_app.py
(mounted alongside admin for local `uvicorn`).
"""
from fastapi import FastAPI

from shared.api.middleware import install_middleware
from shared.routes.health import router as health_router

from gameplay_lambda.routes import account, achievements, catalog, decks, gameplay, guest, runs


def create_app() -> FastAPI:
    app = FastAPI(
        title="FATCHAD Gameplay API",
        version="0.1.0",
    )
    install_middleware(app)
    app.include_router(health_router)
    app.include_router(catalog.router)
    app.include_router(decks.router)
    app.include_router(achievements.router)
    app.include_router(guest.router)
    app.include_router(account.router)
    app.include_router(runs.router)
    app.include_router(decks.router)
    app.include_router(achievements.router)
    app.include_router(gameplay.router)
    return app


app = create_app()
