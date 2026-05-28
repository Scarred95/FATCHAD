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
  }
}
