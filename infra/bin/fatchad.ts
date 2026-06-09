#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FatchadBootstrapStack } from '../lib/bootstrap-stack';
import { FatchadFrontendStack } from '../lib/frontend-stack';
import { FatchadDataStack } from '../lib/ddb-stack';
import { FatchadApiStack } from '../lib/api-stack';
import { FatchadCognitoStack } from '../lib/cognito-stack';



const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'eu-central-1',
};

const githubOwner = app.node.tryGetContext('githubOwner') as string;
const githubRepo = app.node.tryGetContext('githubRepo') as string;

new FatchadBootstrapStack(app, 'FatchadBootstrapStack', {
  env,
  description: 'One-time bootstrap: GitHub OIDC provider + deploy roles. Deploy locally.',
  githubOwner,
  githubRepo,
});

// domainName + hostedZoneId: when both are set, FatchadFrontendStack fronts
// the bucket with CloudFront + ACM and points the Route 53 apex at it. Pulled
// from cdk.json context; omit them and the stack ships the bucket alone.
const domainName = app.node.tryGetContext('domainName') as string | undefined;
const hostedZoneId = app.node.tryGetContext('hostedZoneId') as string | undefined;

new FatchadFrontendStack(app, 'FatchadFrontendStack', {
  env,
  description: 'FATCHAD frontend: S3 website bucket + CloudFront/Route 53 for the React SPA.',
  domainName,
  hostedZoneId,
});

new FatchadDataStack(app, 'FatchadDataStack', {
  env,
  description: 'FATCHAD data: DynamoDB tables for catalog + user data.',
});

// adminToken: pulled from CDK context so it doesn't get committed. Set with
//   `npx cdk deploy FatchadApiStack -c adminToken=... -c corsOrigins=...`
// or in the deploy workflow as `--context adminToken=$ADMIN_TOKEN`. A dev
// fallback keeps `cdk synth` working locally without ceremony.
const adminToken = (app.node.tryGetContext('adminToken') as string) ?? 'dev-token-change-me';
const corsOrigins = (app.node.tryGetContext('corsOrigins') as string) ?? 'http://localhost:5173';

const cognitoStack = new FatchadCognitoStack(app, 'FatchadCognitoStack', {
  env,
  description: 'FATCHAD auth: Cognito User Pool with admin + user groups.',
});

new FatchadApiStack(app, 'FatchadApiStack', {
  env,
  description: 'FATCHAD API: admin + gameplay Lambdas behind one HTTP API.',
  adminToken,
  corsOrigins,
  cognitoUserPoolId: cognitoStack.userPool.userPoolId,
  cognitoAppClientId: cognitoStack.userPoolClient.userPoolClientId,
});