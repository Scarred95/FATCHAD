import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * Hosts the React SPA build output as a public S3 website. The upload role
 * (created in FatchadBootstrapStack) is what actually pushes files here from
 * GitHub Actions — this stack only provisions the bucket.
 *
 * Step 2 of the migration replaces public S3 hosting with CloudFront + OAC
 * (private bucket); this stack stays, the bucket policy changes.
 */
export class FatchadFrontendStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.bucket = new s3.Bucket(this, 'FatchadFrontendBucket', {
      bucketName: 'fatchad-frontend',

      // SPA: React Router handles client-side routing. S3's "error document"
      // for unknown paths returns index.html so deep links work.
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',

      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),

      // Object versioning: every PUT keeps the prior version. Lets us roll
      // back to a previous deploy in seconds. 90-day retention on the
      // non-current versions keeps storage costs bounded (still <$0.01/mo).
      versioned: true,
      lifecycleRules: [
        {
          id: 'expire-noncurrent-versions',
          noncurrentVersionExpiration: cdk.Duration.days(90),
        },
      ],

      // RETAIN, not DESTROY: the bucket name `fatchad-frontend` is globally
      // unique. If we accidentally `cdk destroy` and someone else grabs the
      // name in the meantime, we lose it permanently. Empty + delete by hand
      // if you really want it gone.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cdk.CfnOutput(this, 'FrontendSiteUrl', {
      value: `http://${this.bucket.bucketWebsiteDomainName}`,
      description: 'Public URL of the deployed frontend.',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.bucket.bucketName,
      description: 'Bucket name for `aws s3 sync` in deploy-frontend.yml.',
    });
  }
}
