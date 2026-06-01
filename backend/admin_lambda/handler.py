"""AWS Lambda entry point for the admin surface.

Wraps the FastAPI app with Mangum, which converts API Gateway HTTP events
into the ASGI protocol FastAPI speaks. Module-level `handler` is the
function Lambda invokes (configured as `admin_lambda.handler.handler`
in the CDK stack).
"""
from mangum import Mangum

from admin_lambda.app import app

# `lifespan="off"` — FastAPI's lifespan protocol is meant for long-running
# processes that start/stop once; Lambda invokes are short-lived and the
# startup/shutdown events would re-fire on every cold start, which is the
# opposite of what we want. Connection/cache singletons live in shared/db
# already and are reused naturally across warm invocations.
handler = Mangum(app, lifespan="off")
