"""Local dev entrypoint — both surfaces in one FastAPI app for `uvicorn`.

    uvicorn dev_app:app --reload

In production each Lambda is invoked independently via its own Mangum
handler (admin_lambda.handler / gameplay_lambda.handler). This combined
app exists only so developers can hit `/admin/*`, `/runs/*`, and
`/healthz` from a single port without running two uvicorn processes.

Builds a fresh app rather than mounting the two Lambda apps as
sub-applications — sub-mounts complicate OpenAPI / docs URLs, and the
router objects are cheap to include directly.
"""
from fastapi import FastAPI

from shared.api.middleware import install_middleware
from shared.routes.health import router as health_router

from admin_lambda.routes import router as admin_router
from gameplay_lambda.routes import achievements, catalog, decks, gameplay, runs


app = FastAPI(
    title="FATCHAD API (dev combined)",
    version="0.1.0",
)
install_middleware(app)
app.include_router(health_router)
app.include_router(catalog.router)
app.include_router(decks.router)
app.include_router(achievements.router)
app.include_router(runs.router)
app.include_router(gameplay.router)
app.include_router(admin_router)
