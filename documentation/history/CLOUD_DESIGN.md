# FATCHAD Cloud Design

> **Historical design record — the AWS migration described here is complete.**
> Kept for the rationale (architecture choices, cost model, non-goals), not as a
> status tracker. For the *current* infra state — stacks, deploy flow, secrets,
> observability — see [backend_documentation/DEPLOYMENT.md](../backend_documentation/DEPLOYMENT.md).

Target: a fully AWS-native deployment that costs ~$3–5/month at indie scale,
scales sub-linearly with user count, and keeps the local dev experience
unchanged. Budget ceiling: $30/month (currently has ~10× headroom).

## Goals
- All compute, storage, auth, CDN on AWS.
- No service that bills while idle (zero-idle property). No NAT, no RDS, no
  ElastiCache for v1.
- One CloudFront domain serves the SPA, the catalogue JSON, the card art,
  and the API.
- Catalogue is published as versioned static JSON, not served per-request
  from a database — every gameplay tick hits a cache, not a DB row.

## Stack at a glance

```
                       ┌────────────────┐
                       │   CloudFront   │ ← Route 53 + ACM
                       └─┬───┬───┬──────┘
       ┌─────────────────┘   │   └──────────────────┐
       │                     │                      │
 ┌─────▼──────┐    ┌─────────▼─────────┐    ┌───────▼────────┐
 │ S3 (SPA)   │    │ S3 (catalog +     │    │ API Gateway    │ ← Cognito JWT
 │ dist/      │    │   card images)    │    │ HTTP API       │
 └────────────┘    └───────────────────┘    └────────┬───────┘
                                                     │
                                              ┌──────▼──────┐
                                              │  Lambda     │  FastAPI + Mangum
                                              │  + in-memory│  + version-checked
                                              │   catalogue │    cache
                                              │   cache     │
                                              └────┬────────┘
                                                   │
                                            ┌──────▼──────┐
                                            │  DynamoDB   │  single-table
                                            │ (runs +     │  pay-per-request
                                            │  profile +  │
                                            │  achieve +  │
                                            │  catalog    │
                                            │  pointer +  │
                                            │  LB)        │
                                            └─────────────┘
```

## What goes where, and why

### CloudFront — the front door
Single domain (`cdn.fatchad.app`). One TLS cert (ACM, free). Multiple cache
behaviors route by path:

| Path | Origin | TTL | Reason |
|---|---|---|---|
| `/api/*` | API Gateway | 0 | dynamic per-user data |
| `/catalog/*` | catalog S3 | 1 year | URL is versioned; never stale |
| `/assets/*` | images S3 | 1 year | content-hashed filenames |
| `/*` | SPA S3 | 5min `index.html`, 1y hashed assets | normal SPA serving |

SPA deep links work via a CloudFront error-response rule: "404 → return
`/index.html` with 200" so `/admin/endings/foo` routes correctly client-side.

### S3 (SPA bucket) — the React build
`npm run build` output. Private bucket; only CloudFront's Origin Access
Control can read. Deploy is `aws s3 sync` from CI.

### S3 (catalog bucket) — published card/ending/deck/achievement JSON
The catalogue is 99% read, 1% write. Static JSON files are the right shape.

**Two-stage model**: DDB is the editing workspace, S3 is the published
edition. Admins edit one card at a time in DDB (cheap per-row reads/writes,
queries by deck, "saved/unsaved" tracking). Players never read DDB —
they download the published JSON from S3 + CloudFront and cache it in the
browser for the session.

**Two bundles per publish — public + full** (anti-cheat / anti-spoiler):

`catalog_public.json` — what players download:
- card titles, descriptions, choice text, stat hints (up/down arrows)
- ending titles + descriptions, deck names, image URLs
- **NO** raw effects, `sets_flags`, `clears_flags`, `requires`,
  `triggers_ending`, `weight`, ending trigger conditions, achievement criteria

`catalog_full.json` — admin UI only (gated by Cognito admins group):
- everything, for the admin authoring surface

Effects are applied **server-side** in the choice endpoint, same as today's
`CardResponse.from_event` strips backend-only fields. Catalogue distribution
extends the same pattern. Players in DevTools see what the UI already shows —
no spoilers, no exploit material.

Publish flow (triggered by an explicit "Publish" button in admin, not per
keystroke save):
1. Admin saves a card via `/api/admin/events` → Lambda writes to DDB
   working copy. Repeat for many cards.
2. Admin clicks Publish → Lambda reads all working copies from DDB.
3. Lambda strips disabled cards, builds both bundles, writes
   `s3://fatchad-catalog/v<n>/catalog_public.json` and
   `s3://fatchad-catalog/v<n>/catalog_full.json`.
4. Lambda bumps the pointer item in DDB
   (`pk="CATALOG", sk="current", version=n`).
5. Frontend reads the pointer once on app boot
   (`GET /api/catalog/current`), then fetches the bundle from
   `cdn.fatchad.app/catalog/v<n>/catalog_public.json` — cached forever
   because the URL changes per publish.

**Bundling strategy — start with one file**: ~800 bytes per card raw,
~250 bytes gzipped. 500 cards = ~125 KB gzipped, 1000 cards = ~250 KB
gzipped. Trivial to download once and cache. Split per-deck (manifest +
N bundles) **only** if total exceeds ~500 KB gzipped or decks become
achievement-locked. Migration is ~2 hours of work — don't preempt it.

**Frontend lookup performance**: 1000-card `Map<id, Card>` builds in ~1 ms,
each lookup is microseconds. Filtering by deck through 1000 items takes
~0.1 ms. Holding the full catalogue in memory is a non-concern at any
realistic size.

**Retention**: keep every published version in S3 (microscopic storage cost).
Enables instant rollback (`bump pointer to v40`), keeps stale clients
working, supports forensics.

Cost: ~$0. Cache-hit ratio on the catalogue approaches 100%.

### S3 (image bucket) — card art
Content-hashed filenames so each upload is a new URL. Same infinite TTL
as the catalogue. No DB rows for binary data.

### API Gateway HTTP API — the gatekeeper
$1 per million requests. Cognito JWT authorizer validates tokens before
Lambda is even invoked, so 401s cost zero compute. CORS handled in config.
Custom domain via ACM, routed through CloudFront.

### Lambda — the backend
One function for v1: FastAPI + Mangum adapter. Same code that runs
locally with uvicorn. Cold start ~400ms; warm calls <50ms.

Per-route-group split is a v2 optimization — move `/admin/*` to its own
Lambda when IAM scoping matters, and `/runs/{id}/choice` to its own Lambda
with provisioned concurrency if cold starts hurt gameplay.

**In-memory caching is the secret weapon**: Lambda containers stay warm
15–45 minutes. The catalogue, achievement definitions, and recent user
profiles are cached in process. Each handler checks the DDB pointer item
(one tiny read) and only refreshes RAM if the version bumped. Converts
~80% of "DB reads" into "RAM reads" for free.

### Cognito User Pools — auth
Free for first 50K MAU. Issues JWTs. API Gateway validates them natively.
PostConfirmation Lambda trigger writes the initial `USER#<sub>#PROFILE`
row on first sign-in. Anonymous play stays available via localStorage
user-id; "claim my anonymous runs" flow links the two on sign-up.

Admin authorization moves from the hand-rolled bearer token to a Cognito
group (`admins`); the JWT carries `cognito:groups: ["admins"]` and the
backend gates `/admin/*` on that claim.

### DynamoDB — per-user transactional data
One table, single-table design. Pay-per-request — scales to $0 idle.

```
PK                    SK                         Notes
USER#<uid>            PROFILE                    display name, totals, current_points
USER#<uid>            RUN#<run_id>               full GameState
USER#<uid>            ACH#<ach_id>               unlocked_at, progress
USER#<uid>            UNLOCK#<deck_name>         unlocked deck
CATALOG               current                    {version, url}
CATALOG               EVENT#<event_id>           working-copy card (admin-edited, not yet published)
CATALOG               ENDING#<ending_id>         working-copy ending
CATALOG               DECK#<deck_name>           deck config (from DECKS_DESIGN.md)
CATALOG               ACH#<ach_id>               achievement definition
LB#points             SCORE#<padded>#<uid>       leaderboard entry, display_name denormalized
LB#longest            SCORE#<padded>#<uid>       leaderboard entry, run_id denormalized
```

Two notable patterns:
- **Working copy vs published**: admin edits live in DDB rows. A "publish"
  action snapshots them into S3 versioned JSON. The split lets authors
  iterate without forcing a new client-cache invalidation per keystroke.
- **Leaderboards via padded sort keys**: `SCORE#<padded_score>#<uid>` lets
  `Query ScanIndexForward=false Limit=100` return top-100 in one call.
  Update on personal best = delete-old + put-new. ~30 lines of code.
  Cache the endpoint at CloudFront for 60s; ~100 actual DDB reads/day total.

### DynamoDB Streams + aggregator Lambda
When an achievement is unlocked (`USER#<uid>#ACH#*` write), the stream
event triggers a small Lambda that recomputes the user's points and
updates their `LB#points` entry. No polling, no cron.

### CloudWatch Logs — observability
Free at indie scale. Add X-Ray ($1/mo) later if cold-start tuning needs
distributed tracing.

## Why not the other options

- **RDS Postgres for leaderboards**: works fine, costs $15/mo minimum, and
  breaks the zero-idle property of the rest of the stack. Adopt later when
  multiple features want SQL (friends graph, analytics, advanced search) so
  the spend amortizes.
- **DocumentDB / Aurora Serverless v2**: $200 / $43 minimum. Out of budget
  for "one DB."
- **ElastiCache Redis**: $13/mo minimum for a `t4g.micro`. DDB + CloudFront
  60s TTL on `/leaderboard` covers the same use case at $0.
- **Upstash Redis**: serverless Redis, free tier covers indie scale. Best
  leaderboard primitive available, but breaks "100% AWS." Hold in reserve.
- **Lambda Function URLs**: free, but you reinvent Cognito-authorizer +
  CORS + custom-domain in Python. Not worth the $0.60/million saved.
- **NAT Gateway / VPC**: $32/mo just for the NAT. Don't put Lambda in a
  VPC unless something inside requires it.

## Cost projection

| Service | 1K MAU | 5K MAU |
|---|---|---|
| Cognito | $0 (50K MAU free) | $0 |
| Lambda | $0 (free tier) | $0–1 |
| API Gateway HTTP | $0.60 | $3 |
| DynamoDB (all data, incl. leaderboards) | $1–2 | $6–9 |
| S3 (SPA + catalog + images) | $0.25 | $0.50 |
| CloudFront | $0 (1TB free) | $0–2 |
| Route 53 hosted zone | $0.50 | $0.50 |
| CloudWatch Logs | $1 | $3 |
| ACM cert | $0 | $0 |
| **Total** | **~$3–4/mo** | **~$15–20/mo** |

$30 budget gives ~10× headroom at indie scale. Reserve the headroom for:
1. Provisioned concurrency on `/runs/{id}/choice` (~$5/mo per instance) if
   cold starts hurt gameplay.
2. WAF (~$5/mo + per-request) if scraping/bots show up.
3. A second region for DR (doubles costs) — only when you have a real user base.

## Migration order

> **Status (as built):** steps 1–7 and 9 are **done**; step 8 (leaderboards) is
> **not yet implemented** — the DDB key builders exist (`backend/shared/db/keys.py`)
> but there are no leaderboard endpoints or writes. Of the open questions below,
> region (`eu-central-1`) and single-account are settled in `infra/`; JWT-claim
> denormalization and offline/service-worker remain deferred by design.

Slices, smallest-risk first. Each step is shippable independently.

1. **CDK skeleton + GitHub OIDC**. Empty stack that deploys one hello-world
   Lambda. Proves the pipeline. ✅
2. **Cognito + frontend auth**. Replace `userStore`-only flow with Cognito
   JWT. Anonymous mode still works. No backend changes — JWT just sits in
   the client. ✅
3. **Lambda + DDB backend running in parallel** with the existing Mongo
   FastAPI. Frontend env var toggles target. Compare behaviour under real
   traffic. ✅
4. **Port catalogue + game state**. One-time migration script reads Mongo,
   writes DDB. Then implement the S3 publish step for the catalogue. ✅
5. **Cut over fully; retire Mongo backend.** ✅
6. **User accounts surface**: profile page, "claim my anonymous runs." ✅
7. **Achievements**: definitions in DDB, evaluator in Lambda, UI in admin
   + player profile. ✅
8. **Leaderboards**: DDB partitions + CloudFront-cached endpoints. ⏳ not built
9. **Admin auth via Cognito group**, retire hand-rolled bearer token. ✅

Steps 1–5 are infrastructure with no new user features. Steps 6–9 are the
goals that motivated the migration.

## Open questions

1. **Catalogue distribution**: S3 versioned snapshots (proposed) — confirms
   the publish step is acceptable, vs serving directly from DDB.
2. **JWT claim denormalization**: include `display_name`, `is_admin`,
   `achievement_points` in the token so /me-style requests don't hit DDB?
   Updates lag until token refresh (1h default).
3. **Service worker / offline play**: cache the catalogue JSON on the
   client for offline support + instant first paint?
4. **Region**: `eu-central-1` (Frankfurt) makes sense given the German UI.
   Confirm.
5. **One AWS account, or split prod/staging**? Indie suggestion: one
   account, two stacks named `fatchad-prod` / `fatchad-staging`.
6. **GDPR delete-on-request**: Cognito + DDB both support it; needs to be
   wired into the data model (user-id partition keys make this easy).

## Non-goals (v1)

- Multi-region DR.
- Real-time leaderboard updates (<1s). DDB Streams + CloudFront 60s is fine.
- ElastiCache Redis or DAX.
- A dedicated analytics warehouse (Athena over S3 is the natural future
  step when this matters).
- Friends / social graph features.
