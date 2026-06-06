"""Scheduled guest-account sweep.

Runs on an EventBridge daily schedule (02:00). Deletes throwaway guest accounts
— the Cognito user *and* its DynamoDB data — once they're older than
GUEST_MAX_AGE_HOURS, so the pool and table don't accumulate dead guests.

Guests are identified by membership in the `guest` Cognito group (set at
creation by POST /guest). Cognito stamps each user with UserCreateDate, so the
age check needs no custom bookkeeping.

Set GUEST_MAX_AGE_HOURS=0 to wipe every guest on each run (mind that this also
kills sessions started just before the sweep).

Configured as `cleanup_lambda.handler.handler` in FatchadCognitoStack.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import boto3
from aws_lambda_powertools import Logger

from shared.db.user_repo import UserRepo

logger = Logger(service="fatchad-guest-cleanup")

_GUEST_GROUP = "guest"


def _sub_from_attrs(attrs: list[dict]) -> str | None:
    for a in attrs:
        if a.get("Name") == "sub":
            return a.get("Value")
    return None


def handler(_event: dict, _context) -> dict:
    pool_id = os.environ["COGNITO_USER_POOL_ID"]
    max_age_hours = int(os.getenv("GUEST_MAX_AGE_HOURS", "24"))
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)

    cognito = boto3.client("cognito-idp")
    users = UserRepo()

    scanned = 0
    deleted = 0
    pagination_token: str | None = None

    while True:
        kwargs = {"UserPoolId": pool_id, "GroupName": _GUEST_GROUP, "Limit": 60}
        if pagination_token:
            kwargs["NextToken"] = pagination_token
        resp = cognito.list_users_in_group(**kwargs)

        for user in resp.get("Users", []):
            scanned += 1
            created = user.get("UserCreateDate")
            if created is None or created > cutoff:
                continue  # too young to reap

            username = user.get("Username")
            sub = _sub_from_attrs(user.get("Attributes", []))
            try:
                if sub:
                    n = users.delete_all_user_data(sub)
                    logger.info("Deleted guest data", sub=sub, items=n)
                cognito.admin_delete_user(UserPoolId=pool_id, Username=username)
                deleted += 1
            except Exception:  # noqa: BLE001 — one bad guest shouldn't abort the sweep
                logger.exception("Failed to delete guest", username=username)

        pagination_token = resp.get("NextToken")
        if not pagination_token:
            break

    logger.info(
        "Guest sweep complete",
        scanned=scanned,
        deleted=deleted,
        max_age_hours=max_age_hours,
    )
    return {"scanned": scanned, "deleted": deleted}
