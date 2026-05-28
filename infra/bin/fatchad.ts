#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FatchadBootstrapStack } from '../lib/bootstrap-stack';
import { FatchadAppStack } from '../lib/app-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'eu-central-1',
};

const githubOwner = app.node.tryGetContext('githubOwner') as string;
const githubRepo = app.node.tryGetContext('githubRepo') as string;

new FatchadBootstrapStack(app, 'FatchadBootstrapStack', {
  env,
  description: 'One-time bootstrap: GitHub OIDC provider + deploy role. Deploy locally.',
  githubOwner,
  githubRepo,
});

new FatchadAppStack(app, 'FatchadAppStack', {
  env,
  description: 'FATCHAD test stack: S3 static site + hello-world Lambda.',
});
