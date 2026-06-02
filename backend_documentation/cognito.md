# Cognito Authentication

## Infrastructure Stack

**Files:** `infra/lib/cognito-stack.ts` *(new)*, `infra/bin/fatchad.ts`

Created a new CDK stack `FatchadCognitoStack` that deploys:

- **User Pool** `fatchad-users` — email/password login, self-registration, password reset via email
- **Group** `admin` — full access to `/admin/*` routes
- **Group** `user` — regular players
- **App Client** `fatchad-web` — for the React frontend (no secret, SRP auth, 1h access token, 30d refresh token)

**Outputs:** `UserPoolId`, `UserPoolClientId`, `UserPoolRegion` — needed by frontend and backend.

```bash
cdk deploy FatchadCognitoStack
```

---

## Backend JWT Verification

**Files:** `backend/requirements.txt`, `backend/shared/auth.py`, `infra/lib/api-stack.ts`

**Problem:** Admin auth was a single hardcoded bearer token. No real user identity existed.

**What changed:**

Added `python-jose[cryptography]` — the standard Python library for verifying JWTs signed with RS256 (which Cognito uses).

Rewrote `auth.py` with two modes:

### Production
*Active when `COGNITO_USER_POOL_ID` env var is set*

- `verify_token()` fetches Cognito's public keys (JWKS) once per Lambda container, cached in RAM
- Every token is verified: signature, expiry, issuer
- `require_admin` → checks JWT + `cognito:groups` contains `"admin"`
- `get_current_user_id` → returns the `sub` claim (Cognito's unique user ID)

### Local Dev
*Active when `COGNITO_USER_POOL_ID` is NOT set*

- Falls back to the old `ADMIN_TOKEN` bearer check — `.\start.ps1` keeps working without a deployed Cognito stack

Both Lambdas now receive `COGNITO_USER_POOL_ID` and `COGNITO_APP_CLIENT_ID` as environment variables (passed from the Cognito stack outputs via CDK).

---

## What is still pending

| Task | Description |
|---|---|
| Frontend | Login / Register / Forgot Password pages |
| Routes migration | Remove `?user_id=` query params — derive `user_id` from JWT `sub` claim instead |
