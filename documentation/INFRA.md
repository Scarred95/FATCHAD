# FATCHAD Infra

CDK app for the FATCHAD AWS deployment. Currently covers step 1 of the
migration plan in [`CLOUD_DESIGN.md`](history/CLOUD_DESIGN.md): IAM trust for CI
and the public S3 bucket that hosts the React SPA. The backend (Lambda + API
Gateway + DynamoDB + Cognito) arrives in later steps.

## One-time local bootstrap

Run this once per AWS account, with admin credentials. It creates the IAM
roles that GitHub Actions assumes for every subsequent deploy.

```bash
cd infra
npm install

# Authenticate with AWS as an admin (e.g. `aws sso login`).
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=eu-central-1

# CDK's own bootstrap (CDKToolkit stack) — required before any cdk deploy.
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION

# Our bootstrap stack: OIDC provider + two deploy roles.
npx cdk deploy FatchadBootstrapStack
```

Copy the two role ARN outputs and add them as GitHub Actions secrets:

```
Settings → Secrets and variables → Actions → New repository secret

  Name:  AWS_DEPLOY_ROLE_ARN
  Value: <FatchadBootstrapStack.GitHubDeployRoleArn output>

  Name:  AWS_FRONTEND_UPLOAD_ROLE_ARN
  Value: <FatchadBootstrapStack.FrontendUploadRoleArn output>
```

- `AWS_DEPLOY_ROLE_ARN` is used by `deploy-infra.yml` to run `cdk deploy`.
- `AWS_FRONTEND_UPLOAD_ROLE_ARN` is used by `deploy-frontend.yml` to sync
  the React build to the `fatchad-frontend` S3 bucket. Two roles for
  least-privilege: a leaked frontend role can only overwrite the SPA
  bucket, nothing else.

Then create the frontend bucket (also once):

```bash
npx cdk deploy FatchadFrontendStack
```

After this, all further deploys ride on GitHub Actions.

## Stacks

| Stack | Contains | How it's deployed |
|---|---|---|
| `FatchadBootstrapStack` | OIDC provider, `FatchadGitHubDeployRole`, `FatchadFrontendUploadRole` | Manual from a laptop. Re-deploy only when IAM trust changes. |
| `FatchadFrontendStack` | `fatchad-frontend` S3 bucket (versioned, public website hosting) + CloudFront distribution, ACM cert, Route 53 alias for `fatchad.de` | First time manual. After that, `deploy-infra.yml` redeploys it whenever `infra/**` changes. |
| `FatchadDataStack` | `fatchad_catalog` + `fatchad_user_data` DynamoDB tables (pay-per-request, streams enabled) | Tag-driven via `deploy-data.yml`. Push a `database-v*` tag (e.g. `database-v0.1.0`) or run the workflow manually. Backend wiring lands in a later step. |

### `FatchadFrontendStack`

| Resource | Purpose |
|---|---|
| `fatchad-frontend` S3 bucket | Hosts the React SPA build via S3 static-website hosting (public read). |
| Object versioning + 90d retention | Every PUT keeps the prior version. Lets us roll back without rebuilding. |
| Removal policy: RETAIN | `cdk destroy` keeps the bucket. The bucket name is globally unique — losing it is permanent. |
| CloudFront distribution | TLS + edge caching in front of the bucket. Origin is the S3 *website* endpoint (HTTP-only, so the origin hop is HTTP; the viewer hop is forced to HTTPS). The website endpoint serves index.html for unknown paths, so SPA deep links work without a custom error rule. |
| ACM certificate (us-east-1) | TLS cert for `fatchad.de`. CloudFront only reads certs from us-east-1; provisioned there via `DnsValidatedCertificate` (DNS-validated against the Route 53 zone). |
| Route 53 A/AAAA alias | Points the `fatchad.de` apex at the distribution. Alias records are free to query and work on the bare domain (a plain CNAME can't). |

**Custom domain is gated on context.** `cdk.json` carries `domainName`
(`fatchad.de`) and `hostedZoneId`. The CloudFront/ACM/Route 53 resources only
render when **both** are set, so a context-free `cdk synth` still produces the
bucket alone. Get the zone id once with:

```bash
aws route53 list-hosted-zones-by-name --dns-name fatchad.de \
  --query "HostedZones[0].Id" --output text   # strip the /hostedzone/ prefix
```

and replace `REPLACE_WITH_ROUTE53_ZONE_ID` in `infra/cdk.json`.

The first `cdk deploy FatchadFrontendStack` that includes the domain takes
~15–20 min (CloudFront propagation + ACM validation). After that, every
`frontend-v*` release syncs the new build to S3 **and invalidates the
CloudFront cache** (`/*`, one path, free) so it's visible immediately instead
of after the TTL. The upload role carries `cloudfront:CreateInvalidation` for
this — no new GitHub secret.

> **Why bucket stays public:** we use the S3 website origin for free SPA
> routing, which requires public read. Locking the bucket private behind
> CloudFront OAC is a later step — it needs the S3 REST origin plus a custom
> 404→index.html response rule to keep deep links working.

### `FatchadDataStack`

Two DynamoDB tables, no GSIs in v1.

| Table | Holds | Streams to (later) |
|---|---|---|
| `fatchad_catalog` | Decks, Cards, Endings, Achievements, current-version pointer. Every entity has an `enabled` flag — disabled items stay in the editor but get stripped from the published bundle. | Optional cache-invalidation / audit Lambda. |
| `fatchad_user_data` | Profiles, deck unlocks, achievements, runs (active/ended/abandoned), leaderboards. | Leaderboard aggregator Lambda. |

Different PK strategies on purpose:

- **`fatchad_catalog`** uses one PK per entity type (`DECK`, `EVENT`, `ENDING`, `ACH`, `META`). No parent/child fetches happen at runtime — gameplay reads from a cached snapshot, so the single-table "Query returns parent + children" trick is wasted here. Per-type PKs make admin listings a clean `Query pk=EVENT` and spread load across partitions.
- **`fatchad_user_data`** uses `PK=USER#<uid>` for everything user-scoped, plus `PK=LB#<scope>` for leaderboards. This is real single-table design — loading a user's full state (profile + unlocks + achievements + active run) is one Query. Leaderboards live in their own partitions because they're never joined with user items.

See header comments in [`lib/ddb-stack.ts`](../infra/lib/ddb-stack.ts) for the full PK/SK conventions per entity.

**Removal policy is currently `DESTROY` on both tables.** That's deliberate for the development phase — schema can change, data is fixture-only. Flip both to `RETAIN` before any real user account is created; the day we forget is the day we accidentally `cdk destroy` and lose history.

The bucket itself is provisioned by CDK; the actual SPA files are uploaded
by `deploy-frontend.yml` with `aws s3 sync`, not by `cdk deploy`. This split
keeps the CDK stack stable across releases — only true infrastructure
changes (e.g. bucket policy or versioning) trigger a CDK deploy.

## Releasing the frontend

```bash
# From the repo root, on whatever branch:
git tag frontend-v0.1.0
git push origin frontend-v0.1.0
```

`deploy-frontend.yml` fires, builds the frontend with `VITE_WIP_MODE=true`
and `VITE_APP_VERSION=v0.1.0`, then syncs `frontend/dist/` to
`s3://fatchad-frontend/`. Workflow summary prints the public URL.

Manual deploys from the Actions tab (`workflow_dispatch`) also work — handy
for hotfix redeploys without bumping the version.

### Rolling back

S3 object versioning is on, so every previous deploy is recoverable:

```bash
# List versions of index.html
aws s3api list-object-versions --bucket fatchad-frontend --prefix index.html

# Promote a specific version back to "current"
aws s3api copy-object \
  --copy-source "fatchad-frontend/index.html?versionId=<VERSION_ID>" \
  --bucket fatchad-frontend \
  --key index.html
```

For a full multi-file rollback, just redeploy the previous tag via
`workflow_dispatch` with `version_label=v0.0.9`.

## Releasing the database schema

```bash
# From the repo root, on whatever branch:
git tag database-v0.1.0
git push origin database-v0.1.0
```

`deploy-data.yml` fires, synths + diffs + deploys `FatchadDataStack`. The
tag is the source of truth for "what schema version is live" — `git tag -l
'database-v*' --sort=-v:refname | head` answers that question.

Manual deploys via `workflow_dispatch` also work, useful for redeploying
the current tag after a CDK-only change (e.g. tweaking outputs) without
bumping the version.

CDK is declarative, so re-running the same tag is a no-op. Adding a GSI,
flipping `removalPolicy`, or enabling/changing a stream are real diffs and
will be applied. Renaming a table is a destroy+create — CDK will warn,
and in DESTROY mode it'll happily delete the old one. Read the diff.

## Local development

```bash
npm run synth                         # CloudFormation only, no deploy
npx cdk diff FatchadFrontendStack     # what would change
npx cdk deploy FatchadFrontendStack   # deploy from your laptop (skips CI)
```

## Notes

- **Region**: `eu-central-1` (Frankfurt). Change via `CDK_DEFAULT_REGION`
  env var, or edit `bin/fatchad.ts`.
- **Why split the bootstrap stack?** It manages the role GitHub Actions
  uses. Chicken-and-egg: CI can't deploy its own trust. So the bootstrap
  stack is laptop-only, and `deploy-infra.yml` deliberately excludes it.
- **Least-privilege CDK deploy role**: only `sts:AssumeRole` on `cdk-*`
  roles in this account and `ssm:GetParameter` on `/cdk-bootstrap/*`. The
  four `cdk-hnb659fds-*` roles created by `cdk bootstrap` hold the actual
  power to create resources. A leaked deploy role can only deploy the
  CDK stacks defined in this repo.
- **Least-privilege frontend upload role**: only `s3:Put/Get/Delete` on
  the `fatchad-frontend` bucket and its objects. Trust is scoped to the
  `frontend-v*` tag pattern and `main` only.
- **Public S3 bucket** with static-website hosting is the shipped frontend
  serving model. CloudFront + Origin Access Control was evaluated and dropped;
  plain S3 hosting keeps the setup simple and is what's live.
