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
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }
