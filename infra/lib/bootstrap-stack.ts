import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface FatchadBootstrapStackProps extends cdk.StackProps {
  githubOwner: string;
  githubRepo: string;
}

/**
 * Creates the IAM trust needed for GitHub Actions to deploy the app stack via
 * OIDC — no long-lived AWS keys in the repo. Deploy this once, locally, with
 * an admin AWS profile. After that, GitHub Actions assumes `GitHubDeployRole`
 * to run `cdk deploy FatchadAppStack`.
 */
export class FatchadBootstrapStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FatchadBootstrapStackProps) {
    super(scope, id, props);

    // The GitHub OIDC provider is an account-global resource. If it already
    // exists (e.g. another project created it), comment this block and use
    // OpenIdConnectProvider.fromOpenIdConnectProviderArn instead.
    const provider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    // Trust only this repo. Tighten the `sub` further (e.g. to a specific
    // branch or environment) once the pipeline is stable.
    const subjectPattern = `repo:${props.githubOwner}/${props.githubRepo}:*`;

    const deployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'FatchadGitHubDeployRole',
      assumedBy: new iam.FederatedPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': subjectPattern,
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      description: `Assumed by GitHub Actions in ${props.githubOwner}/${props.githubRepo} to deploy CDK stacks.`,
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Least-privilege CDK deploy permissions. `cdk bootstrap` created four
    // `cdk-hnb659fds-*-<account>-<region>` roles that hold the actual power
    // to create resources. All this role needs is permission to assume them,
    // plus read the bootstrap version SSM parameter so cdk-assets can verify
    // the bootstrap stack is up to date.
    //
    // Locking the trust to `aws:ResourceAccount = <this account>` means even
    // if the role ARN leaks, it can only assume cdk roles in our own account.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AssumeCdkBootstrapRoles',
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
        conditions: {
          StringEquals: {
            'aws:ResourceAccount': this.account,
          },
        },
      }),
    );

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ReadCdkBootstrapVersion',
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/*`,
        ],
      }),
    );

    new cdk.CfnOutput(this, 'GitHubDeployRoleArn', {
      value: deployRole.roleArn,
      description: 'Put this in the GitHub Actions workflow as role-to-assume.',
    });

    // ------------------------------------------------------------------
    // FatchadFrontendUploadRole — scoped to frontend bucket sync only.
    //
    // Trust: only the deploy-frontend.yml workflow can assume this, and only
    // when running on a `frontend-v*` tag or a `workflow_dispatch` from main
    // or the active dev branch. Branch pushes / PRs cannot assume it.
    //
    // Permissions: list/get/put/delete on `fatchad-frontend` bucket + its
    // objects. Nothing else.
    // ------------------------------------------------------------------
    const frontendUploadRole = new iam.Role(this, 'FatchadFrontendUploadRole', {
      roleName: 'FatchadFrontendUploadRole',
      assumedBy: new iam.FederatedPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          // GitHub's OIDC `sub` for tags: repo:OWNER/REPO:ref:refs/tags/<tag>
          // For workflow_dispatch:        repo:OWNER/REPO:ref:refs/heads/<branch>
          // We allow either, but only for frontend-v* tags / specific branches.
          StringLike: {
            'token.actions.githubusercontent.com:sub': [
              `repo:${props.githubOwner}/${props.githubRepo}:ref:refs/tags/frontend-v*`,
              `repo:${props.githubOwner}/${props.githubRepo}:ref:refs/heads/main`,
              `repo:${props.githubOwner}/${props.githubRepo}:ref:refs/heads/aurendev-CICD_AWS_TEST`,
            ],
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      description: 'Assumed by deploy-frontend workflow to sync dist/ to S3.',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Hardcoded bucket ARN — the name is fixed by the frontend stack and S3
    // bucket names are globally unique, so this is stable. Avoids a cross-
    // stack import that would force deploy ordering.
    const frontendBucketArn = `arn:aws:s3:::fatchad-frontend`;

    frontendUploadRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ListFrontendBucket',
        actions: ['s3:ListBucket', 's3:GetBucketLocation'],
        resources: [frontendBucketArn],
      }),
    );

    frontendUploadRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'WriteFrontendObjects',
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:PutObjectAcl',
          's3:DeleteObject',
        ],
        resources: [`${frontendBucketArn}/*`],
      }),
    );

    // The deploy workflow reads `HttpApiUrl` from `FatchadApiStack` outputs
    // at build time so it can bake `VITE_API_BASE_URL` into the bundle.
    // Scoped to just describing this one stack — no other CloudFormation
    // visibility, no template downloads.
    frontendUploadRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DescribeApiStackOutputs',
        actions: ['cloudformation:DescribeStacks'],
        resources: [
          `arn:aws:cloudformation:${this.region}:${this.account}:stack/FatchadApiStack/*`,
        ],
      }),
    );

    new cdk.CfnOutput(this, 'FrontendUploadRoleArn', {
      value: frontendUploadRole.roleArn,
      description: 'Put this in deploy-frontend.yml as AWS_FRONTEND_UPLOAD_ROLE_ARN secret.',
    });

    // ------------------------------------------------------------------
    // FatchadLambdaDeployRole — scoped to `cdk deploy FatchadApiStack`.
    //
    // Trust: only `lambdaV*` tag pushes or workflow_dispatch from main /
    // the active dev branch. Mirrors the scoping pattern used by the
    // frontend upload role so the blast radius of a leaked token is bounded
    // to "the workflow that's allowed to deploy Lambdas".
    //
    // Permissions: same shape as FatchadGitHubDeployRole — assume the
    // cdk-bootstrap roles + read the bootstrap version SSM parameter. The
    // bootstrap roles hold the real create/update permissions, this role
    // just unlocks them.
    // ------------------------------------------------------------------
    const lambdaDeployRole = new iam.Role(this, 'FatchadLambdaDeployRole', {
      roleName: 'FatchadLambdaDeployRole',
      assumedBy: new iam.FederatedPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': [
              `repo:${props.githubOwner}/${props.githubRepo}:ref:refs/tags/lambdaV*`,
              `repo:${props.githubOwner}/${props.githubRepo}:ref:refs/heads/main`,
              `repo:${props.githubOwner}/${props.githubRepo}:ref:refs/heads/aurendev-CICD_AWS_TEST`,
            ],
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      description: 'Assumed by deploy-lambdas workflow to cdk deploy FatchadApiStack.',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    lambdaDeployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AssumeCdkBootstrapRoles',
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
        conditions: {
          StringEquals: {
            'aws:ResourceAccount': this.account,
          },
        },
      }),
    );

    lambdaDeployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ReadCdkBootstrapVersion',
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/*`,
        ],
      }),
    );

    new cdk.CfnOutput(this, 'LambdaDeployRoleArn', {
      value: lambdaDeployRole.roleArn,
      description: 'Put this in deploy-lambdas.yml as AWS_LAMBDA_DEPLOY_ROLE_ARN secret.',
    });
  }
}
