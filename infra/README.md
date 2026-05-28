# FATCHAD Infra (Step 1: CDK skeleton + GitHub OIDC)

Proves the deploy pipeline end to end: a push to `main` updates an S3-hosted
page and a Python Lambda. See [`CLOUD_DESIGN.md`](../CLOUD_DESIGN.md) for the
full target architecture; this directory currently implements only step 1
of the migration plan.

## One-time local bootstrap

You only run this once per AWS account, with admin credentials. It creates the
IAM role that GitHub Actions assumes for every subsequent deploy.

```bash
cd infra
npm install

# Make sure you're authenticated with AWS as an admin (e.g. `aws sso login`).
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=eu-central-1

# CDK's own bootstrap (CDKToolkit stack) — required before any cdk deploy.
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION

# Our bootstrap stack: GitHub OIDC provider + GitHubDeployRole.
npx cdk deploy FatchadBootstrapStack
```

Copy the `GitHubDeployRoleArn` output and add it to the repository as a
GitHub Actions secret named `AWS_DEPLOY_ROLE_ARN`:

```
Settings → Secrets and variables → Actions → New repository secret
  Name:  AWS_DEPLOY_ROLE_ARN
  Value: arn:aws:iam::<account>:role/FatchadGitHubDeployRole
```

## What gets deployed (`FatchadAppStack`)

| Resource | Purpose |
|---|---|
| S3 bucket (website hosting) | Serves `web/index.html` publicly. Replaced by CloudFront + OAC in step 2. |
| Python 3.12 Lambda | `lambda/hello/index.py` — returns JSON. |
| Lambda Function URL | Public HTTPS endpoint. No API Gateway yet (that's step 3). |

After the GitHub Actions deploy succeeds, find the URLs in the workflow log's
"Deploy" step output (`SiteUrl`, `HelloLambdaUrl`) or with:

```bash
aws cloudformation describe-stacks \
  --stack-name FatchadAppStack \
  --query 'Stacks[0].Outputs' \
  --region eu-central-1
```

Paste the Lambda URL into `infra/web/index.html` (`LAMBDA_URL` constant), push
again, and the page's "Ping Lambda" button will work.

## Local development

```bash
npm run synth                  # generate CloudFormation, no deploy
npx cdk diff FatchadAppStack   # see what would change
npx cdk deploy FatchadAppStack # deploy from your laptop (skips GH Actions)
```

## Notes

- **Region**: `eu-central-1` (Frankfurt). Change via `CDK_DEFAULT_REGION` or
  edit `bin/fatchad.ts`.
- **Why two stacks?** The bootstrap stack creates the role GitHub Actions
  needs. Chicken-and-egg: GH can't deploy the role it uses to deploy.
- **Least-privilege deploy role**: the GitHub role can only `sts:AssumeRole`
  on `cdk-*` roles in this account, and read `/cdk-bootstrap/*` SSM params.
  The four `cdk-hnb659fds-*` roles created by `cdk bootstrap` hold the actual
  power to create resources; CDK assumes them during deploy. So even if the
  GitHub role ARN leaks, the attacker can't do anything outside of "deploy
  the CDK stacks defined in this repo".
- **Public S3 bucket** is fine for the hello-world page. In step 2 we move
  to CloudFront + Origin Access Control and lock the bucket private.
