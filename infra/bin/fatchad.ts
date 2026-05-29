#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FatchadBootstrapStack } from '../lib/bootstrap-stack';
import { FatchadFrontendStack } from '../lib/frontend-stack';
import { FatchadDataStack } from '../lib/ddb-stack';



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

new FatchadFrontendStack(app, 'FatchadFrontendStack', {
  env,
  description: 'FATCHAD frontend: S3 website bucket for the React SPA.',
});

new FatchadDataStack(app, 'FatchadDataStack', {
  env,
  description: 'FATCHAD data: DynamoDB tables for catalog + user data.',
});