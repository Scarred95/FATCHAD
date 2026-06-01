"""AWS Lambda entry point for the gameplay surface.

Wraps the FastAPI app with Mangum, which converts API Gateway HTTP events
into the ASGI protocol FastAPI speaks. Module-level `handler` is the
function Lambda invokes (configured as `gameplay_lambda.handler.handler`
in the CDK stack).
"""
from mangum import Mangum

from gameplay_lambda.app import app

# `lifespan="off"` — see admin_lambda/handler.py for the rationale.
handler = Mangum(app, lifespan="off")
