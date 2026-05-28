import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * Step 1 of the migration: prove the pipeline. One S3-website bucket and one
 * Python Lambda with a public Function URL. Replaced by CloudFront + API
 * Gateway + Cognito in later steps — see CLOUD_DESIGN.md.
 */
export class FatchadAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- Static site bucket (S3 website hosting) ----------------------------
    // Public read for v1 only. Step 2 swaps this for CloudFront + OAC so the
    // bucket can stay private.
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new s3deploy.BucketDeployment(this, 'SiteDeployment', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', 'web'))],
      destinationBucket: siteBucket,
    });

    // --- Hello-world Lambda -------------------------------------------------
    const helloFn = new lambda.Function(this, 'HelloFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'hello')),
      timeout: cdk.Duration.seconds(5),
      memorySize: 128,
    });

    const helloUrl = helloFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.GET],
      },
    });

    // --- Outputs ------------------------------------------------------------
    new cdk.CfnOutput(this, 'SiteUrl', {
      value: `http://${siteBucket.bucketWebsiteDomainName}`,
      description: 'S3 static-website URL for the hello page.',
    });

    new cdk.CfnOutput(this, 'HelloLambdaUrl', {
      value: helloUrl.url,
      description: 'Public Function URL for the hello Lambda.',
    });
  }
}
