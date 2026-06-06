"""Cognito PostConfirmation trigger — create the user's PROFILE row on signup.

Cognito invokes this synchronously right after a user confirms their account
(email-code verification). We write the initial Profile item keyed by the
Cognito `sub` — the exact id the rest of the app derives from the JWT — so the
user's display name and lifetime totals exist from the moment they can log in.

The PROFILE row is NOT required to start or load runs (those are keyed by
USER#<sub> independently); it backs display_name, profile totals, and the
leaderboard denormalisation.

Only does work on ConfirmSignUp. The same trigger also fires after a
forgot-password confirmation (PostConfirmation_ConfirmForgotPassword), which
must not recreate or overwrite an existing profile.

PostConfirmation contract: return the event dict unchanged. Raising would
block the user's confirmation, so a write failure is logged and swallowed —
a missing profile is cheaper to backfill later than a wedged signup.

Configured as `cognito_lambda.handler.handler` in FatchadCognitoStack.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import boto3

from shared.db.user_repo import UserRepo
from shared.schemas import Profile

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_USER_GROUP = "user"


def handler(event: dict, _context) -> dict:
    if event.get("triggerSource") != "PostConfirmation_ConfirmSignUp":
        return event

    attrs = event.get("request", {}).get("userAttributes", {})
    sub = attrs.get("sub")
    if not sub:
        logger.error("PostConfirmation event has no sub claim; skipping profile create")
        return event

    # Place the newly-confirmed account into the `user` group so identity
    # checks that key off cognito:groups see a real player (self-signups land
    # in no group otherwise). Best-effort: a failure here must not block the
    # confirmation, and the group can be backfilled later.
    try:
        boto3.client("cognito-idp").admin_add_user_to_group(
            UserPoolId=event["userPoolId"],
            Username=event["userName"],
            GroupName=_USER_GROUP,
        )
        logger.info("Added %s to group %s", sub, _USER_GROUP)
    except Exception:  # noqa: BLE001 — never block signup on group assignment
        logger.exception("Failed to add %s to group %s", sub, _USER_GROUP)

    display_name = attrs.get("name") or _name_from_email(attrs.get("email", ""))

    try:
        users = UserRepo()
        # Idempotent: a stray re-fire must not clobber accrued totals.
        if users.get_profile(sub) is not None:
            logger.info("Profile already exists for %s; skipping", sub)
            return event
        now = datetime.now(timezone.utc)
        users.put_profile(Profile(
            user_id=sub,
            display_name=display_name,
            created_at=now,
            updated_at=now,
        ))
        # Real-account only: add to the admin user directory. Guests are created
        # via guest.py (which never calls this trigger), so they stay out of it.
        users.put_directory_entry(sub, display_name)
        logger.info("Created profile for %s (%s)", sub, display_name)
    except Exception:  # noqa: BLE001 — never block signup on a profile write
        logger.exception("Failed to create profile for %s", sub)

    return event


def _name_from_email(email: str) -> str:
    """Fallback display name when no `name` attribute was supplied at signup."""
    local = email.split("@", 1)[0] if email else ""
    return local or "Spieler"
