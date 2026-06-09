import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';

export interface FatchadFrontendStackProps extends cdk.StackProps {
  // When both are set, the stack fronts the bucket with CloudFront + ACM and
  // wires a Route 53 alias so `https://<domainName>` serves the SPA. Left
  // undefined (e.g. local `cdk synth` with no context) the stack provisions
  // the bucket alone and skips the custom-domain plumbing.
  domainName?: string;
  hostedZoneId?: string;
}

/**
 * Hosts the React SPA build output. The bucket is an S3 static-website origin;
 * GitHub Actions (via the upload role from FatchadBootstrapStack) pushes the
 * build into it — this stack only provisions infrastructure.
 *
 * With a domain configured, CloudFront sits in front for TLS + edge caching
 * and Route 53 points the apex at it. The bucket stays public-read and keeps
 * the S3 website endpoint as CloudFront's origin: that endpoint already maps
 * unknown paths to index.html, so SPA deep links work without a separate
 * CloudFront error-response rule. (Locking the bucket private behind OAC is a
 * later step — it needs the S3 REST origin + a custom 404→index.html rule.)
 */
export class FatchadFrontendStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: FatchadFrontendStackProps) {
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
    // --- Tags so the bill is legible later -------------------------------
    cdk.Tags.of(this).add('Project', 'FATCHAD');
    cdk.Tags.of(this).add('Component', 'frontend');

    new cdk.CfnOutput(this, 'FrontendSiteUrl', {
      value: `http://${this.bucket.bucketWebsiteDomainName}`,
      description: 'Raw S3 website URL (HTTP only). Prefer the custom domain below.',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.bucket.bucketName,
      description: 'Bucket name for `aws s3 sync` in deploy-frontend.yml.',
    });

    // ------------------------------------------------------------------
    // Custom domain: CloudFront + ACM + Route 53. Only when configured.
    // ------------------------------------------------------------------
    if (props?.domainName && props?.hostedZoneId) {
      // fromHostedZoneAttributes, NOT fromLookup: a lookup does an SDK call at
      // synth time using the ambient (least-privilege deploy) role, which has
      // no route53:ListHostedZones. Passing the zone id by context keeps synth
      // credential-free and CI-safe.
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.domainName,
      });

      // CloudFront only reads certs from us-east-1, regardless of where the
      // distribution lives. DnsValidatedCertificate provisions the cert there
      // via a custom resource (running under the cdk cfn-exec role, which has
      // the route53 perms to write the validation records) — that's why this
      // works from a eu-central-1 stack under the scoped deploy role. It's
      // deprecated but the non-deprecated path needs a second us-east-1 stack
      // + crossRegionReferences + a workflow that deploys both; not worth the
      // extra moving parts for one cert.
      const certificate = new acm.DnsValidatedCertificate(this, 'SiteCert', {
        domainName: props.domainName,
        hostedZone: zone,
        region: 'us-east-1',
      });

      const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
        defaultBehavior: {
          // S3 *website* endpoint as a custom HTTP origin (not the REST/OAC
          // origin): the website endpoint serves index.html for unknown paths,
          // giving SPA routing for free. S3 website hosting is HTTP-only, so
          // the CloudFront→origin hop is HTTP_ONLY by necessity; the viewer
          // hop is forced to HTTPS below.
          origin: new origins.HttpOrigin(this.bucket.bucketWebsiteDomainName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        domainNames: [props.domainName],
        certificate,
        defaultRootObject: 'index.html',
        comment: 'FATCHAD SPA',
      });

      // Apex A/AAAA aliases → CloudFront. Alias records are free to query and
      // can sit on the bare domain (a plain CNAME can't).
      new route53.ARecord(this, 'SiteAliasA', {
        zone,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      });
      new route53.AaaaRecord(this, 'SiteAliasAAAA', {
        zone,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      });

      new cdk.CfnOutput(this, 'CustomDomainUrl', {
        value: `https://${props.domainName}`,
        description: 'Public HTTPS URL of the deployed frontend.',
      });

      // deploy-frontend.yml reads this to invalidate the edge cache after a
      // sync, so a new build is visible immediately instead of after the TTL.
      new cdk.CfnOutput(this, 'DistributionId', {
        value: distribution.distributionId,
        description: 'CloudFront distribution id — used for cache invalidation in CI.',
      });

      new cdk.CfnOutput(this, 'DistributionDomainName', {
        value: distribution.distributionDomainName,
        description: 'CloudFront domain (the alias target).',
      });
    }
  }
}
