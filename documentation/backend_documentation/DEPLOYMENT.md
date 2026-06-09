# FATCHAD — AWS Deployment

How the backend gets from `git push` to a live HTTP endpoint, what each
piece of infrastructure does, and where to look when something breaks.

This document describes the **API layer** (Lambdas + HTTP API). The data
layer (`FatchadDataStack`) and frontend (`FatchadFrontendStack`) have the
same shape but live in their own stacks/workflows; see [CLOUD_DESIGN.md](../history/CLOUD_DESIGN.md)
for the broader picture (a historical design record — migration complete).

---

## TL;DR

```
git tag lambda-v0.1.0          GitHub Actions    CDK              AWS
git push origin lambda-v0.1.0  ──────────────►   cdk deploy ────► FatchadApiStack
                                                                  ├─ S3 bucket (catalog bundles)
                                                                  ├─ Lambda: fatchad-admin
                                                                  ├─ Lambda: fatchad-gameplay
                                                                  └─ HTTP API → routes both
```

Once deployed, the HTTP API URL (printed in the workflow summary and in
the CloudFormation stack outputs) is the only thing the frontend needs.

---

## Stacks

| Stack | File | What it owns |
|---|---|---|
| `FatchadBootstrapStack` | [infra/lib/bootstrap-stack.ts](../../infra/lib/bootstrap-stack.ts) | GitHub OIDC provider + three IAM deploy roles |
| `FatchadDataStack`      | [infra/lib/ddb-stack.ts](../../infra/lib/ddb-stack.ts)           | DynamoDB tables `fatchad_catalog` + `fatchad_user_data` |
| `FatchadFrontendStack`  | [infra/lib/frontend-stack.ts](../../infra/lib/frontend-stack.ts) | S3 website bucket for the React build |
| `FatchadCognitoStack`   | [infra/lib/cognito-stack.ts](../../infra/lib/cognito-stack.ts)   | Cognito User Pool + `admin`/`user`/`guest` groups + web app client |
| `FatchadApiStack`       | [infra/lib/api-stack.ts](../../infra/lib/api-stack.ts)           | Catalog bundle bucket, two Lambdas, HTTP API |

All five are instantiated in [infra/bin/fatchad.ts](../../infra/bin/fatchad.ts). The API stack
consumes the Cognito stack's `userPoolId` / `userPoolClientId` so its Lambdas can
verify JWTs. Default region is `eu-central-1`; account comes from
`CDK_DEFAULT_ACCOUNT` (your AWS profile).

---

## What FatchadApiStack actually creates

### `fatchad-catalog` (S3 bucket)
Holds versioned catalog snapshots written by the publish endpoint:

```
s3://fatchad-catalog/v1/catalog_full.json     ← server-side (effects, weights, requires)
s3://fatchad-catalog/v1/catalog_public.json   ← player-safe (effects/weights stripped)
s3://fatchad-catalog/v2/...
```

- `BlockPublicAccess.BLOCK_ALL` — nothing is reachable from the internet.
  The frontend fetches the public bundle via a signed/cached path
  (planned), never the bucket directly.
- `versioned: true` — every PUT preserves the prior object version. Cheap
  insurance against an accidental overwrite (we don't overwrite in
  practice — each publish writes a new `v<n>/` prefix).
- `RemovalPolicy.RETAIN` — `cdk destroy` will not nuke the catalog. The
  bucket name is globally unique; losing it would be permanent.

### `fatchad-admin` (Lambda)
- Handler: `admin_lambda.handler.handler` — Mangum wraps the FastAPI app
  in [backend/admin_lambda/app.py](../../backend/admin_lambda/app.py).
- Runtime: Python 3.12, 512 MB, 15 s timeout.
- Env vars: `CATALOG_TABLE`, `USER_TABLE`, `CATALOG_BUCKET`,
  `ADMIN_TOKEN`, `CORS_ORIGINS`, plus `COGNITO_USER_POOL_ID` and
  `COGNITO_APP_CLIENT_ID` (when the Cognito stack is wired). `AWS_REGION` is
  auto-injected by Lambda.
- IAM: `fatchad_catalog` RW + `fatchad-catalog` PUT/GET + `fatchad_user_data`
  **read-only**. The read-only user-data grant exists for the admin
  inspection views (Users directory, per-user detail, Run-Inspektor), which
  Query profiles/runs/achievements but never mutate them.

### `fatchad-gameplay` (Lambda)
- Handler: `gameplay_lambda.handler.handler`.
- Runtime: Python 3.12, 512 MB, 10 s timeout.
- Env vars: same minus `ADMIN_TOKEN` (no admin-gated routes); still receives
  the `COGNITO_*` vars to verify player JWTs.
- IAM: `fatchad_user_data` RW + `fatchad_catalog` **read-only** +
  `fatchad-catalog` GET. Gameplay can never mutate the catalog.

Each Lambda ships **only its own handler package + `shared/`** plus the
installed Python deps, bundled via Docker
(`pip install -r requirements.txt -t /asset-output`). The opposite
surface's code is excluded from the bundle, so gameplay literally cannot
`import admin_lambda...` at runtime — the IAM boundary is mirrored by an
import boundary.

Layers were considered and rejected — they complicate local dev because
the import path on Lambda diverges from the path under `dev_app.py`.

### `fatchad-api` (HTTP API v2)
Four routes, two integrations:

| Path | Method | → Lambda |
|---|---|---|
| `/admin`            | ANY | admin    |
| `/admin/{proxy+}`   | ANY | admin    |
| `/`                 | ANY | gameplay |
| `/{proxy+}`         | ANY | gameplay |

Why two `/admin` rules? `{proxy+}` only matches **non-empty** path
segments — without the bare `/admin` route, a request to exactly `/admin`
would fall through to gameplay.

CORS is handled inside FastAPI (`shared/api/middleware`), not at the
gateway, so the rules don't change when origins do — just redeploy.

### Log groups
- `/aws/lambda/fatchad-admin` — 14-day retention.
- `/aws/lambda/fatchad-gameplay` — 14-day retention.

Created explicitly (`logs.LogGroup`) instead of using the deprecated
`logRetention` prop, which spins up a custom resource Lambda at deploy
time just to call `PutRetentionPolicy`.

---

## Observability

> **Status: partially built.** Request-id correlation and the raw Lambda log
> groups exist; the CloudWatch dashboard and structured logging on the support
> Lambdas are now built too. Structured per-request JSON logging on the
> gameplay/admin path is still the one planned piece.

### Request correlation (implemented)

`RequestIDMiddleware` (`backend/shared/api/middleware.py`) stamps every request
with an `X-Request-ID` — reusing a client-supplied one for trace stitching,
otherwise minting a hex uuid — stashes it on `request.state.request_id`, and
echoes it back in the response header. It does **not** itself emit a structured
log line; it just makes the id available to any logger that wants to correlate.
Plain `logging` is used elsewhere (e.g. the CORS wildcard warning in the same
file); Lambda forwards stdout/stderr to the per-function log groups above.

### Structured logging (partially built)

The two support Lambdas — Cognito post-confirm (`cognito_lambda`) and guest
cleanup (`cleanup_lambda`) — emit structured JSON via `aws-lambda-powertools`
`Logger` (in `backend/requirements.txt`, bundled into each function), keyed by a
`service` name and per-event fields (`sub`, `items`, `scanned`, `deleted`, …).

**Still planned:** one JSON line per *gameplay/admin request* so CloudWatch can
filter by field (`request_id`, `method`, `path`, `status_code`, `duration_ms`,
`cold_start`). `RequestIDMiddleware` still emits no per-request line — wiring it
means having the middleware log (via Powertools or a hand-rolled JSON formatter)
keyed by the existing `request_id`.

### Dashboard (implemented)

A CloudWatch Dashboard named `fatchad` is built in `infra/lib/api-stack.ts`
(`cloudwatch.Dashboard`) from free built-in AWS metrics (no custom metrics, no
extra cost):
- **Lambda Errors / Duration / Invocations** for the admin + gameplay functions.
- **DDB consumed read/write capacity** on `fatchad_user_data`.
- **Support Lambda Errors / Invocations** for `fatchad-guest-cleanup` and
  `fatchad-post-confirm` — those live in `FatchadCognitoStack`, so they're
  referenced by function name (no cross-stack ref) rather than by construct.

---

## How a deploy works

1. **Tag the commit** — `git tag lambda-v<major>.<minor>.<patch>` and push.
   The pattern `lambda-v*` triggers
   [.github/workflows/deploy-lambdas.yml](../../.github/workflows/deploy-lambdas.yml). Anything else (branch
   pushes, PR opens, frontend tags) is ignored.

2. **OIDC handshake** — the workflow exchanges its short-lived GitHub
   OIDC token for AWS credentials via
   `aws-actions/configure-aws-credentials@v4`, assuming
   `FatchadLambdaDeployRole`. That role's trust policy only accepts
   tokens whose `sub` claim matches `refs/tags/lambda-v*` (or
   workflow_dispatch from `main`), so a leaked ARN can't be assumed
   from arbitrary branches.

3. **Bundle** — `cdk synth` invokes the Docker bundler. Each Lambda's
   asset is built fresh from `backend/requirements.txt` + the source
   tree. The bundler runs `pip install -t /asset-output` so dependencies
   land alongside the handlers on `/var/task`.

4. **Deploy** — `cdk deploy FatchadApiStack` calls CloudFormation, which
   uploads the assets to the CDK staging bucket, swaps the Lambda code,
   and reconfigures the HTTP API if any routes changed.

5. **Outputs** — `cdk-outputs.json` is written and the workflow summary
   prints the HTTP API URL.

The deploy is idempotent. Re-running on the same tag is safe (you'll
just upload identical assets and CloudFormation will diff to a no-op).

---

## Secrets and config

Configured **once** in the GitHub repo (Settings → Secrets and variables
→ Actions):

| Secret | Used for | Notes |
|---|---|---|
| `AWS_LAMBDA_DEPLOY_ROLE_ARN` | OIDC role assume in `deploy-lambdas.yml` | From `FatchadBootstrapStack` outputs (`LambdaDeployRoleArn`). |
| `ADMIN_TOKEN`                | Local-dev fallback for `/admin/*`    | Only used when `COGNITO_USER_POOL_ID` is unset; in deployed envs `/admin/*` is gated by the Cognito `admin` group. Generate with `openssl rand -hex 32`. |
| `CORS_ORIGINS`               | Frontend origin allow-list           | Comma-separated, e.g. `https://fatchad.example,http://localhost:5173`. |

Both `ADMIN_TOKEN` and `CORS_ORIGINS` are passed into CDK as
`-c adminToken=... -c corsOrigins=...`, then injected into the Lambda
env. If you forget to set them, the workflow expands to `""` and the
Lambdas come up with empty values — the admin token becomes a literal
empty string, which is a bad day.

---

## Bootstrap (one-time, manual)

`FatchadBootstrapStack` mints the OIDC provider and roles that every
other stack relies on. It can't itself be deployed via GitHub Actions
(chicken-and-egg), so deploy it locally with admin AWS creds:

```bash
cd infra
npx cdk deploy FatchadBootstrapStack \
  -c githubOwner=Scarred95 \
  -c githubRepo=FATCHAD
```

Then copy the three role ARNs from the output into the corresponding
GitHub secrets:

| Output | Secret |
|---|---|
| `GitHubDeployRoleArn`     | `AWS_DEPLOY_ROLE_ARN`           |
| `FrontendUploadRoleArn`   | `AWS_FRONTEND_UPLOAD_ROLE_ARN`  |
| `LambdaDeployRoleArn`     | `AWS_LAMBDA_DEPLOY_ROLE_ARN`    |

After that, all subsequent deploys (data, frontend, lambdas) run from
GitHub Actions on tag push.

---

## Where to find things on AWS

| Question | Where |
|---|---|
| What's the API base URL? | CloudFormation → `FatchadApiStack` → Outputs → `HttpApiUrl`. Also in the GH Actions run summary. |
| What routes exist?       | API Gateway → APIs → `fatchad-api` → Routes. |
| Did a Lambda crash?      | CloudWatch Logs → `/aws/lambda/fatchad-admin` or `/aws/lambda/fatchad-gameplay`. |
| How's the system doing?  | CloudWatch → Dashboards → `fatchad` (Lambda errors/duration/invocations, DDB capacity, support Lambdas). |
| What env vars are live?  | Lambda console → function → Configuration → Environment variables. |
| What got published?      | S3 → `fatchad-catalog/` (prefixes are `v1/`, `v2/`, …) and DDB `fatchad_catalog` item `PK=META, SK=current`. |
| Last deploy succeeded?   | GitHub → Actions → "Deploy lambdas". |

---

## Smoke tests

```bash
export API=https://<id>.execute-api.eu-central-1.amazonaws.com

# Public surface — needs no auth
curl -i "$API/healthz"

# Authenticated calls need a Cognito JWT. Once the Cognito stack is deployed,
# both /runs and /admin/* require a Bearer access token (the ADMIN_TOKEN
# fallback only applies in local dev, where COGNITO_USER_POOL_ID is unset).
export JWT=<Cognito access token for a player>
export ADMIN_JWT=<Cognito access token for a user in the `admin` group>

# Create a run (user_id comes from the JWT `sub`, not the body;
# will softlock-end if the catalog is empty)
curl -s -X POST "$API/runs" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -d '{}' | jq

# Admin: trigger a publish
curl -s -X POST "$API/admin/publish" \
  -H "Authorization: Bearer $ADMIN_JWT" | jq

# What's currently published
curl -s "$API/admin/publish/current" \
  -H "Authorization: Bearer $ADMIN_JWT" | jq

# Verify S3 received the bundle
aws s3 ls s3://fatchad-catalog/ --recursive --region eu-central-1
```

Live tailing the Lambda logs while you poke at the API:

```bash
aws logs tail /aws/lambda/fatchad-gameplay --follow --region eu-central-1
aws logs tail /aws/lambda/fatchad-admin    --follow --region eu-central-1
```

---

## Design choices worth knowing

**Two Lambdas, not one.** Splitting admin and gameplay lets us scope IAM
per-surface (gameplay genuinely cannot mutate the catalog, by IAM not
just by code path) and right-size memory/timeout independently. Cold
starts are paid per-function, but the two surfaces have very different
traffic shapes — gameplay is hot during play, admin is sporadic — so
sharing a function would conflate their warm pools anyway.

**Tag-driven deploys, not branch-driven.** Every backend version on
production maps to a `lambda-v<x.y.z>` git tag. `git tag --list 'lambda-v*'`
answers "what shipped, in what order?". Branch pushes don't deploy,
which means a casual merge to `main` never accidentally ships.

**HTTP API v2, not REST API.** Cheaper, lower latency, plenty for our
needs. We don't use request validation, transformations, or usage
plans — and if we ever do, migrating to REST API is a route-by-route
swap, not a rewrite.

**Bundles, not Lambda layers.** Each Lambda's deployment package
includes its own copy of `shared/` + its handler package + dependencies.
The other surface's package is excluded, so the gameplay bundle has no
`admin_lambda/` and vice versa — the IAM boundary is reinforced by an
import boundary, and a typo in a route can't accidentally reach across.
Duplicates a few MB of deps across the two functions; in exchange the
import path is identical on Lambda and under `uvicorn dev_app:app`,
which means dev-vs-prod import bugs simply can't happen.

**Mangum, not a custom adapter.** Mangum is the boring, well-tested ASGI
↔ API Gateway adapter. It has no DB awareness — boto3 inside the app
reads its config from the Lambda env vars and IAM role. The handler is
literally `Mangum(app, lifespan="off")`; `lifespan="off"` because Lambda
gives us no clean shutdown signal, so FastAPI startup/shutdown hooks
would fire at unpredictable times.

**Catalog cache, not per-request DDB fan-out.** Gameplay reads the
publish pointer from DDB on the first request after a cold start, then
caches the catalog snapshot in-process. Subsequent requests in the same
container hit memory only. A new publish bumps the pointer version,
which the next pointer read notices, triggering a refetch. This is why
`fatchad-gameplay` only needs **read** on `fatchad_catalog`.
