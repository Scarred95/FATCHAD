"""Hello-world Lambda — proves the deploy pipeline works end to end."""
import json
import os
from datetime import datetime, timezone


def handler(event, context):
    body = {
        "message": "Hello from FATCHAD Lambda",
        "now": datetime.now(timezone.utc).isoformat(),
        "region": os.environ.get("AWS_REGION", "unknown"),
        "function": os.environ.get("AWS_LAMBDA_FUNCTION_NAME", "unknown"),
    }
    # CORS headers are handled by the Function URL config in CDK
    # (see app-stack.ts → addFunctionUrl → cors). Setting them again here
    # would produce a duplicated Access-Control-Allow-Origin header that
    # browsers reject.
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
        },
        "body": json.dumps(body),
    }
