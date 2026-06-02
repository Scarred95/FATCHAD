# gameplay_lambda/routes/guest.py
"""Guest sessions — mint a throwaway Cognito account on demand.

POST /guest is unauthenticated. It creates a confirmed Cognito user in the
`guest` group with a random email + password, writes the user's PROFILE row,
and returns the credentials so the browser can sign in via the normal SRP
flow. From the app's perspective a guest is just a user whose JWT carries the
`guest` group — runs persist under USER#<sub> like anyone else, and the
account can later be claimed by a real signup (see account-claim).

Guests are tagged via the `guest` Cognito group rather than the display name:
it keeps them queryable for later cleanup and visible in the JWT's
`cognito:groups` without colliding with a real user's chosen name.

Returning the password to the client is acceptable here: it's a disposable
secret for a throwaway account, sent once over HTTPS to the same client that
will immediately use it.
"""
from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import datetime, timezone

import boto3
from fastapi import APIRouter, Depends, HTTPException

from shared.db.user_repo import UserRepo
from shared.schemas import Profile

from gameplay_lambda.routes._deps import get_user_repo
from gameplay_lambda.routes._schemas import GuestSessionResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/guest", tags=["guest"])

_GUEST_GROUP = "guest"
_GUEST_EMAIL_DOMAIN = "guest.fatchad.local"
_GUEST_DISPLAY_NAME = "Gast"


def _generate_password() -> str:
    """Random password that always satisfies the pool policy (>=8 chars,
    lowercase + digit). token_urlsafe is mixed-case + digits; the suffix
    guarantees the required classes regardless of what it produced."""
    return secrets.token_urlsafe(18) + "aA1"


def _sub_from_attrs(attrs: list[dict]) -> str | None:
    for a in attrs:
        if a.get("Name") == "sub":
            return a.get("Value")
    return None


@router.post("", response_model=GuestSessionResponse, status_code=201)
def create_guest(users: UserRepo = Depends(get_user_repo)):
    pool_id = os.getenv("COGNITO_USER_POOL_ID")
    if not pool_id:
        raise HTTPException(503, "Guest accounts unavailable — auth not configured")

    email = f"guest-{uuid.uuid4().hex}@{_GUEST_EMAIL_DOMAIN}"
    password = _generate_password()
    cognito = boto3.client("cognito-idp")

    # Create + confirm in one shot: suppress the (undeliverable) invite email,
    # mark the address verified, then set a permanent password — which flips the
    # user straight to CONFIRMED so SRP login works immediately.
    created = cognito.admin_create_user(
        UserPoolId=pool_id,
        Username=email,
        MessageAction="SUPPRESS",
        UserAttributes=[
            {"Name": "email", "Value": email},
            {"Name": "email_verified", "Value": "true"},
            {"Name": "name", "Value": _GUEST_DISPLAY_NAME},
        ],
    )
    cognito.admin_set_user_password(
        UserPoolId=pool_id,
        Username=email,
        Password=password,
        Permanent=True,
    )
    cognito.admin_add_user_to_group(
        UserPoolId=pool_id,
        Username=email,
        GroupName=_GUEST_GROUP,
    )

    # PostConfirmation never fires for admin-created users, so write the PROFILE
    # row here — same shape the trigger would have written for a normal signup.
    sub = _sub_from_attrs(created["User"]["Attributes"])
    if sub:
        now = datetime.now(timezone.utc)
        try:
            users.put_profile(Profile(
                user_id=sub,
                display_name=_GUEST_DISPLAY_NAME,
                created_at=now,
                updated_at=now,
            ))
        except Exception:  # noqa: BLE001 — profile is backfillable; don't fail the session
            logger.exception("Failed to write guest profile for %s", sub)
    else:
        logger.error("admin_create_user returned no sub for %s; profile not written", email)

    return GuestSessionResponse(email=email, password=password)
