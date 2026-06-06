import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
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
 *              + leaderboard table RW (points sync + run publish)
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
  /** Cognito User Pool ID — when set, both Lambdas verify JWTs against this pool. */
  cognitoUserPoolId?: string;
  /** Cognito App Client ID — passed to Lambdas for token audience validation. */
  cognitoAppClientId?: string;
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
    const leaderboardTable = dynamodb.Table.fromTableName(
      this,
      'LeaderboardTableRef',
      'fatchad_leaderboard',
    );

    // ------------------------------------------------------------------
    // Per-Lambda code assets
    //
    // Each function ships only its own handler package + `shared/` + the
    // installed Python deps. The opposite surface's code is excluded so
    // gameplay cannot accidentally `import admin_lambda...` (or vice
    // versa) — making the IAM boundary mirrored by an import boundary.
    //
    // Cost: two Docker bundling runs per `cdk synth`, each doing its own
    // `pip install` against the same requirements.txt. Acceptable; both
    // assets are cached by content hash so unchanged deploys skip the
    // rebuild.
    //
    // Docker bundling: requires Docker on whatever runs `cdk synth/deploy`.
    // GitHub Actions runners have it; locally, devs need it (or skip CDK
    // synth and let the workflow handle deploys).
    // ------------------------------------------------------------------
    const backendDir = path.join(__dirname, '..', '..', 'backend');

    const buildAsset = (packageDir: string): lambda.Code =>
      lambda.Code.fromAsset(backendDir, {
        // Hash only the inputs that actually shape the bundle. Without
        // this, edits to gameplay routes would invalidate the admin
        // asset (and vice versa) because the default hash covers the
        // whole `backendDir`.
        assetHashType: cdk.AssetHashType.OUTPUT,
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c', [
              // Runtime deps. uvicorn is dev-only but stays in
              // requirements.txt since dev_app uses it; the bundle bloat
              // is a few MB, not worth a second requirements file yet.
              'pip install --no-cache-dir -r requirements.txt -t /asset-output',
              // Only this Lambda's package + the shared layer it imports.
              // The other Lambda's package is deliberately excluded.
              `cp -r ${packageDir} shared /asset-output/`,
            ].join(' && '),
          ],
        },
      });

    const adminCode = buildAsset('admin_lambda');
    const gameplayCode = buildAsset('gameplay_lambda');

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
      code: adminCode,
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
      logGroup: adminLogGroup,
      environment: {
        CATALOG_TABLE: 'fatchad_catalog',
        USER_TABLE: 'fatchad_user_data',
        CATALOG_BUCKET: this.catalogBucket.bucketName,
        ADMIN_TOKEN: props.adminToken,
        CORS_ORIGINS: props.corsOrigins,
        ...(props.cognitoUserPoolId && { COGNITO_USER_POOL_ID: props.cognitoUserPoolId }),
        ...(props.cognitoAppClientId && { COGNITO_APP_CLIENT_ID: props.cognitoAppClientId }),
      },
    });

    catalogTable.grantReadWriteData(this.adminFn);
    // Read-only on user data: the admin lookup views (Users directory, per-user
    // detail, Run-Inspektor) Query profiles/runs/achievements but never mutate
    // them. Without this the admin Lambda has USER_TABLE in its env but no IAM
    // access, so those routes 500 with AccessDenied.
    userTable.grantReadData(this.adminFn);
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
      code: gameplayCode,
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      logGroup: gameplayLogGroup,
      environment: {
        CATALOG_TABLE: 'fatchad_catalog',
        USER_TABLE: 'fatchad_user_data',
        LEADERBOARD_TABLE: 'fatchad_leaderboard',
        CATALOG_BUCKET: this.catalogBucket.bucketName,
        CORS_ORIGINS: props.corsOrigins,
        // No ADMIN_TOKEN — gameplay has no admin-gated routes.
        ...(props.cognitoUserPoolId && { COGNITO_USER_POOL_ID: props.cognitoUserPoolId }),
        ...(props.cognitoAppClientId && { COGNITO_APP_CLIENT_ID: props.cognitoAppClientId }),
      },
    });

    // Pointer read + snapshot refill only. Never writes the catalog.
    catalogTable.grantReadData(this.gameplayFn);
    userTable.grantReadWriteData(this.gameplayFn);
    // Points auto-sync on achievement grants + opt-in run publish/unpublish.
    leaderboardTable.grantReadWriteData(this.gameplayFn);
    this.catalogBucket.grantRead(this.gameplayFn);

    // POST /guest mints throwaway Cognito accounts. Scope the admin actions to
    // this one user pool. Only granted when the pool id is known at synth time.
    if (props.cognitoUserPoolId) {
      const userPoolArn = `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${props.cognitoUserPoolId}`;
      this.gameplayFn.addToRolePolicy(new iam.PolicyStatement({
        sid: 'GuestUserProvisioning',
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:AdminAddUserToGroup',
          // Delete a guest account once its progress is claimed (/account/claim).
          'cognito-idp:AdminDeleteUser',
        ],
        resources: [userPoolArn],
      }));
    }

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
    // CloudWatch Dashboard
    //
    // Row 1: Lambda Errors     Row 2: Lambda Duration
    // Row 3: Lambda Invocations  Row 4: DDB capacity (user table)
    // Row 5: Support Lambdas (guest-cleanup + post-confirm) — defined in
    //        FatchadCognitoStack, referenced here by name (no cross-stack ref).
    // ------------------------------------------------------------------
    const dashboard = new cloudwatch.Dashboard(this, 'FatchadDashboard', {
      dashboardName: 'fatchad',
    });

    const p5m = cdk.Duration.minutes(5);

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        left: [
          this.adminFn.metricErrors({ period: p5m, label: 'Admin' }),
          this.gameplayFn.metricErrors({ period: p5m, label: 'Gameplay' }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration (avg ms)',
        left: [
          this.adminFn.metricDuration({ period: p5m, label: 'Admin' }),
          this.gameplayFn.metricDuration({ period: p5m, label: 'Gameplay' }),
        ],
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        left: [
          this.adminFn.metricInvocations({ period: p5m, label: 'Admin' }),
          this.gameplayFn.metricInvocations({ period: p5m, label: 'Gameplay' }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'DDB Consumed Capacity (user table)',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ConsumedReadCapacityUnits',
            dimensionsMap: { TableName: 'fatchad_user_data' },
            period: p5m, statistic: 'Sum', label: 'Reads',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ConsumedWriteCapacityUnits',
            dimensionsMap: { TableName: 'fatchad_user_data' },
            period: p5m, statistic: 'Sum', label: 'Writes',
          }),
        ],
        width: 12,
      }),
    );

    // Support Lambdas live in FatchadCognitoStack — reference by name.
    const lambdaMetric = (fn: string, metricName: string, label: string) =>
      new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName,
        dimensionsMap: { FunctionName: fn },
        period: p5m, statistic: 'Sum', label,
      });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Support Lambda Errors',
        left: [
          lambdaMetric('fatchad-guest-cleanup', 'Errors', 'Guest Cleanup'),
          lambdaMetric('fatchad-post-confirm', 'Errors', 'Post Confirm'),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Support Lambda Invocations',
        left: [
          lambdaMetric('fatchad-guest-cleanup', 'Invocations', 'Guest Cleanup'),
          lambdaMetric('fatchad-post-confirm', 'Invocations', 'Post Confirm'),
        ],
        width: 12,
      }),
    );

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
