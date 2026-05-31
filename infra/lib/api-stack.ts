import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * Two-Lambda backend behind a single HTTP API.
 *
 *   /admin/*    → admin Lambda    (admin_lambda.handler.handler)
 *   everything  → gameplay Lambda (gameplay_lambda.handler.handler)
 *                 — runs/*, healthz, and any future public routes
 *
 * Shared code (`backend/shared/`) ships in both bundles rather than as a
 * Lambda layer — layers complicate local dev (import paths diverge from
 * the dev_app uvicorn run) and the duplicate ~5MB of boto3/fastapi is not
 * worth the operational cost.
 *
 * IAM split:
 *   admin    → catalog table RW + catalog bucket PUT + user table read-only
 *              (only for sanity checks; no run mutation paths exist)
 *   gameplay → catalog table read-only (pointer + items on snapshot refresh)
 *              + catalog bucket GET (bundle download)
 *              + user table RW (run lifecycle)
 *
 * Tables and the catalog bucket are looked up by name rather than imported
 * from FatchadDataStack so this stack can deploy independently of any
 * cross-stack reference ordering. Names are stable (set explicitly in their
 * stacks), and S3 bucket names are globally unique anyway.
 */
export interface FatchadApiStackProps extends cdk.StackProps {
  /** Bearer token the admin Lambda requires. Set per environment. */
  adminToken: string;
  /** Comma-separated origins for CORS (e.g. "https://fatchad.example,https://www.fatchad.example"). */
  corsOrigins: string;
}

export class FatchadApiStack extends cdk.Stack {
  public readonly catalogBucket: s3.Bucket;
  public readonly adminFn: lambda.Function;
  public readonly gameplayFn: lambda.Function;
  public readonly httpApi: apigw.HttpApi;

  constructor(scope: Construct, id: string, props: FatchadApiStackProps) {
    super(scope, id, props);

    // ------------------------------------------------------------------
    // Catalog bundle bucket
    //
    // Holds versioned `v<version>/catalog_full.json` + `catalog_public.json`
    // bundles written by the publish endpoint. The pointer item in DDB
    // records the active version; this bucket is the actual payload store.
    //
    // Versioned + RETAIN: republishing always writes a new key (we never
    // overwrite), but versioning is cheap insurance against a bad CDK diff
    // wiping objects. RETAIN because the bucket name is globally unique and
    // its contents are the live game data — a stray `cdk destroy` should
    // not be silently destructive.
    // ------------------------------------------------------------------
    this.catalogBucket = new s3.Bucket(this, 'FatchadCatalogBucket', {
      bucketName: 'fatchad-catalog',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ------------------------------------------------------------------
    // DDB table refs (by name)
    // ------------------------------------------------------------------
    const catalogTable = dynamodb.Table.fromTableName(
      this,
      'CatalogTableRef',
      'fatchad_catalog',
    );
    const userTable = dynamodb.Table.fromTableName(
      this,
      'UserTableRef',
      'fatchad_user_data',
    );

    // ------------------------------------------------------------------
    // Shared Lambda code asset
    //
    // Both functions ship the same bundle (whole `backend/` minus dev-only
    // and test-only paths). pip installs requirements into the asset root
    // so they land alongside the source on /var/task.
    //
    // Docker bundling: requires Docker on whatever runs `cdk synth/deploy`.
    // GitHub Actions runners have it; locally, devs need it (or skip CDK
    // synth and let the workflow handle deploys).
    // ------------------------------------------------------------------
    const backendDir = path.join(__dirname, '..', '..', 'backend');
    const sharedCode = lambda.Code.fromAsset(backendDir, {
      bundling: {
        image: lambda.Runtime.PYTHON_3_12.bundlingImage,
        command: [
          'bash', '-c', [
            // Install runtime deps (uvicorn is dev-only; not pruned because
            // requirements.txt is shared with the dev entrypoint — bundle
            // bloat is a few MB and not worth a second requirements file
            // yet).
            'pip install --no-cache-dir -r requirements.txt -t /asset-output',
            // Copy source. Excludes keep the asset small and deterministic.
            'cp -r admin_lambda gameplay_lambda shared /asset-output/',
          ].join(' && '),
        ],
      },
    });

    // ------------------------------------------------------------------
    // Admin Lambda
    // ------------------------------------------------------------------
    // Explicit log groups so we can set retention without the deprecated
    // `logRetention` Lambda prop (which spins up a custom resource Lambda
    // to call PutRetentionPolicy at deploy time).
    const adminLogGroup = new logs.LogGroup(this, 'AdminFnLogGroup', {
      logGroupName: '/aws/lambda/fatchad-admin',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const gameplayLogGroup = new logs.LogGroup(this, 'GameplayFnLogGroup', {
      logGroupName: '/aws/lambda/fatchad-gameplay',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.adminFn = new lambda.Function(this, 'AdminFn', {
      functionName: 'fatchad-admin',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'admin_lambda.handler.handler',
      code: sharedCode,
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
      logGroup: adminLogGroup,
      environment: {
        CATALOG_TABLE: 'fatchad_catalog',
        USER_TABLE: 'fatchad_user_data',
        CATALOG_BUCKET: this.catalogBucket.bucketName,
        ADMIN_TOKEN: props.adminToken,
        CORS_ORIGINS: props.corsOrigins,
      },
    });

    catalogTable.grantReadWriteData(this.adminFn);
    // Publish endpoint writes new bundle versions; never overwrites or deletes.
    this.catalogBucket.grantPut(this.adminFn);
    // Admin needs to read the pointer for "what's currently published".
    this.catalogBucket.grantRead(this.adminFn);

    // ------------------------------------------------------------------
    // Gameplay Lambda
    // ------------------------------------------------------------------
    this.gameplayFn = new lambda.Function(this, 'GameplayFn', {
      functionName: 'fatchad-gameplay',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'gameplay_lambda.handler.handler',
      code: sharedCode,
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      logGroup: gameplayLogGroup,
      environment: {
        CATALOG_TABLE: 'fatchad_catalog',
        USER_TABLE: 'fatchad_user_data',
        CATALOG_BUCKET: this.catalogBucket.bucketName,
        CORS_ORIGINS: props.corsOrigins,
        // No ADMIN_TOKEN — gameplay has no admin-gated routes.
      },
    });

    // Pointer read + snapshot refill only. Never writes the catalog.
    catalogTable.grantReadData(this.gameplayFn);
    userTable.grantReadWriteData(this.gameplayFn);
    this.catalogBucket.grantRead(this.gameplayFn);

    // ------------------------------------------------------------------
    // HTTP API (v2)
    //
    // CORS is handled by FastAPI's CORSMiddleware in `shared/api/middleware`,
    // so the HTTP API stays CORS-agnostic. If we ever drop the Mangum layer
    // for direct routes, move CORS to the gateway.
    // ------------------------------------------------------------------
    this.httpApi = new apigw.HttpApi(this, 'FatchadHttpApi', {
      apiName: 'fatchad-api',
      description: 'FATCHAD public + admin surface.',
    });

    const adminIntegration = new integrations.HttpLambdaIntegration(
      'AdminIntegration',
      this.adminFn,
    );
    const gameplayIntegration = new integrations.HttpLambdaIntegration(
      'GameplayIntegration',
      this.gameplayFn,
    );

    // /admin and /admin/{proxy+} → admin Lambda. Two routes because
    // {proxy+} only matches non-empty paths; without the bare /admin entry
    // a GET /admin would fall through to gameplay.
    this.httpApi.addRoutes({
      path: '/admin',
      methods: [apigw.HttpMethod.ANY],
      integration: adminIntegration,
    });
    this.httpApi.addRoutes({
      path: '/admin/{proxy+}',
      methods: [apigw.HttpMethod.ANY],
      integration: adminIntegration,
    });

    // Everything else → gameplay Lambda. /healthz, /runs/*, future public routes.
    this.httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigw.HttpMethod.ANY],
      integration: gameplayIntegration,
    });
    // Bare `/` for shallow probes / friendly 404 from FastAPI.
    this.httpApi.addRoutes({
      path: '/',
      methods: [apigw.HttpMethod.ANY],
      integration: gameplayIntegration,
    });

    // ------------------------------------------------------------------
    // Tags + outputs
    // ------------------------------------------------------------------
    cdk.Tags.of(this).add('Project', 'FATCHAD');
    cdk.Tags.of(this).add('Component', 'api');

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: this.httpApi.apiEndpoint,
      description: 'Base URL of the HTTP API. Wire this into the frontend.',
    });
    new cdk.CfnOutput(this, 'CatalogBucketName', {
      value: this.catalogBucket.bucketName,
      description: 'S3 bucket holding versioned catalog bundles.',
    });
    new cdk.CfnOutput(this, 'AdminFunctionArn', {
      value: this.adminFn.functionArn,
      description: 'ARN of the admin Lambda.',
    });
    new cdk.CfnOutput(this, 'GameplayFunctionArn', {
      value: this.gameplayFn.functionArn,
      description: 'ARN of the gameplay Lambda.',
    });
  }
}
