# gameplay_lambda/routes/account.py
"""Account-level operations that aren't tied to a single run.

POST /account/claim lets a freshly-registered real account absorb the progress
a player made while signed in as a guest. The caller is authenticated as the
real account; the guest is proven by passing its own still-valid access token,
so only whoever holds the guest session can claim it — a real user can't point
this at an arbitrary `sub` to steal someone else's runs.

Flow: verify the guest token, confirm it really is a guest (carries the `guest`
group) and isn't the same account, migrate the guest's runs + profile totals
onto the real account (merge — no data loss), then delete the guest's Cognito
account so it isn't left dangling.
"""
from __future__ import annotations

import logging
import os

import boto3
from fastapi import APIRouter, Depends, HTTPException

from shared.auth import get_current_user_id, verify_token
from shared.db.user_repo import UserRepo

from gameplay_lambda.routes._deps import get_user_repo
from gameplay_lambda.routes._schemas import ClaimGuestRequest, ClaimGuestResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/account", tags=["account"])

_GUEST_GROUP = "guest"


@router.post("/claim", response_model=ClaimGuestResponse)
def claim_guest(
    body: ClaimGuestRequest,
    real_user_id: str = Depends(get_current_user_id),
    users: UserRepo = Depends(get_user_repo),
):
    # Verify the guest's identity from its own token (raises 401 if invalid).
    guest_claims = verify_token(body.guest_access_token)
    guest_sub = guest_claims.get("sub")
    groups = guest_claims.get("cognito:groups", []) or []

    if not guest_sub:
        raise HTTPException(400, "Guest token has no subject")
    if _GUEST_GROUP not in groups:
        # Only throwaway guest accounts can be claimed — never a real account.
        raise HTTPException(403, "Token does not belong to a guest account")
    if guest_sub == real_user_id:
        raise HTTPException(400, "Cannot claim your own account")

    migrated = users.claim_guest_data(guest_sub, real_user_id)

    # Tidy up the now-empty guest account. Best-effort: the data is already
    # migrated, so a delete failure shouldn't fail the claim (a leftover guest
    # gets swept by cleanup later).
    pool_id = os.getenv("COGNITO_USER_POOL_ID")
    guest_username = guest_claims.get("username")
    if pool_id and guest_username:
        try:
            boto3.client("cognito-idp").admin_delete_user(
                UserPoolId=pool_id, Username=guest_username,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Failed to delete claimed guest %s", guest_username)

    return ClaimGuestResponse(migrated_runs=migrated)
