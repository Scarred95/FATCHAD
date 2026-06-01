"""Admin FastAPI app — catalog CRUD + publish, no gameplay surface.

Used both by handler.py (Mangum-wrapped for Lambda) and by dev_app.py
(mounted alongside gameplay for local `uvicorn`).
"""
from fastapi import FastAPI

from shared.api.middleware import install_middleware
from shared.routes.health import router as health_router

from admin_lambda.routes import router as admin_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="FATCHAD Admin API",
        version="0.1.0",
    )
    install_middleware(app)
    app.include_router(health_router)
    app.include_router(admin_router)
    return app


app = create_app()
