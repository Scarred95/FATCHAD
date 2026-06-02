import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * Cognito User Pool for FATCHAD authentication.
 *
 * Two groups:
 *   admin  → access to the admin Lambda surface (/admin/*)
 *   user   → regular players
 *
 * Sign-in: email + password.
 * Self-registration is enabled — players can sign up without an admin invite.
 * Admin accounts must be created manually (or via the Cognito console / CLI)
 * and added to the `admin` group.
 *
 * Outputs (consumed by the frontend + backend):
 *   UserPoolId       → backend JWT verification
 *   UserPoolClientId → frontend SDK initialisation
 */
export class FatchadCognitoStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ------------------------------------------------------------------
    // User Pool
    // ------------------------------------------------------------------
    this.userPool = new cognito.UserPool(this, 'FatchadUserPool', {
      userPoolName: 'fatchad-users',

      // Email is the login identifier — no separate username needed.
      signInAliases: { email: true },
      autoVerify: { email: true },

      // `name` holds the player's chosen display name, collected at signup
      // and copied into the DynamoDB PROFILE row by the PostConfirmation
      // trigger. Optional + mutable: the trigger falls back to the email
      // local-part if it's absent, and players can rename later.
      standardAttributes: {
        fullname: { required: false, mutable: true },
      },

      // Players can register themselves; admins are promoted manually.
      selfSignUpEnabled: true,

      // Password policy — sensible defaults, not overly strict.
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: true,
        requireSymbols: false,
      },

      // Account recovery via email link only.
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,

      // Keep user records on stack deletion in prod to avoid data loss.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ------------------------------------------------------------------
    // Groups
    // ------------------------------------------------------------------
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admin',
      description: 'Full access to the admin surface.',
      precedence: 1,
    });

    new cognito.CfnUserPoolGroup(this, 'UserGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'user',
      description: 'Regular players.',
      precedence: 2,
    });

    // Guests are throwaway accounts minted by POST /guest. The group tags them
    // (visible in the JWT's cognito:groups, queryable for later cleanup) so a
    // guest is distinguishable from a real user without overloading `name`.
    new cognito.CfnUserPoolGroup(this, 'GuestGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'guest',
      description: 'Throwaway guest accounts (POST /guest). Eligible for cleanup.',
      precedence: 3,
    });

    // ------------------------------------------------------------------
    // PostConfirmation trigger
    //
    // Fires once when a player confirms their account. Writes the initial
    // PROFILE row (USER#<sub> / PROFILE) to fatchad_user_data so display
    // name + lifetime totals exist from first login. Bundled the same way
    // as the API Lambdas: this package + `shared/` + pip deps (Docker
    // bundling — needs Docker wherever `cdk synth/deploy` runs).
    //
    // The user table is referenced by name (stable, set in FatchadDataStack)
    // so this stack stays free of cross-stack reference ordering.
    // ------------------------------------------------------------------
    const backendDir = path.join(__dirname, '..', '..', 'backend');

    const postConfirmLogGroup = new logs.LogGroup(this, 'PostConfirmFnLogGroup', {
      logGroupName: '/aws/lambda/fatchad-post-confirm',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const postConfirmFn = new lambda.Function(this, 'PostConfirmFn', {
      functionName: 'fatchad-post-confirm',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'cognito_lambda.handler.handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      logGroup: postConfirmLogGroup,
      environment: {
        USER_TABLE: 'fatchad_user_data',
      },
      code: lambda.Code.fromAsset(backendDir, {
        assetHashType: cdk.AssetHashType.OUTPUT,
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c', [
              'pip install --no-cache-dir -r requirements.txt -t /asset-output',
              'cp -r cognito_lambda shared /asset-output/',
            ].join(' && '),
          ],
        },
      }),
    });

    const userTable = dynamodb.Table.fromTableName(
      this,
      'UserTableRef',
      'fatchad_user_data',
    );
    userTable.grantReadWriteData(postConfirmFn);

    this.userPool.addTrigger(
      cognito.UserPoolOperation.POST_CONFIRMATION,
      postConfirmFn,
    );

    // ------------------------------------------------------------------
    // Guest cleanup — scheduled sweep
    //
    // Runs daily at 02:00 UTC: deletes guest accounts (Cognito user + their
    // fatchad_user_data partition) older than GUEST_MAX_AGE_HOURS. Keeps the
    // pool from accumulating throwaway guests. Set GUEST_MAX_AGE_HOURS=0 to
    // wipe every guest on each run. Same bundling as the other Lambdas.
    // ------------------------------------------------------------------
    const guestCleanupLogGroup = new logs.LogGroup(this, 'GuestCleanupFnLogGroup', {
      logGroupName: '/aws/lambda/fatchad-guest-cleanup',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const guestCleanupFn = new lambda.Function(this, 'GuestCleanupFn', {
      functionName: 'fatchad-guest-cleanup',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'cleanup_lambda.handler.handler',
      memorySize: 256,
      timeout: cdk.Duration.minutes(2),
      logGroup: guestCleanupLogGroup,
      environment: {
        COGNITO_USER_POOL_ID: this.userPool.userPoolId,
        USER_TABLE: 'fatchad_user_data',
        GUEST_MAX_AGE_HOURS: '24',
      },
      code: lambda.Code.fromAsset(backendDir, {
        assetHashType: cdk.AssetHashType.OUTPUT,
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c', [
              'pip install --no-cache-dir -r requirements.txt -t /asset-output',
              'cp -r cleanup_lambda shared /asset-output/',
            ].join(' && '),
          ],
        },
      }),
    });

    userTable.grantReadWriteData(guestCleanupFn);
    guestCleanupFn.addToRolePolicy(new iam.PolicyStatement({
      sid: 'GuestCleanup',
      actions: [
        'cognito-idp:ListUsersInGroup',
        'cognito-idp:AdminDeleteUser',
      ],
      resources: [this.userPool.userPoolArn],
    }));

    new events.Rule(this, 'GuestCleanupSchedule', {
      ruleName: 'fatchad-guest-cleanup-daily',
      description: 'Daily 02:00 UTC sweep of stale guest accounts.',
      schedule: events.Schedule.cron({ minute: '0', hour: '2' }),
      targets: [new targets.LambdaFunction(guestCleanupFn)],
    });

    // ------------------------------------------------------------------
    // App Client (used by the React frontend)
    //
    // No client secret — browser-based apps cannot keep a secret safe.
    // Auth flows: USER_SRP_AUTH (secure password exchange without sending
    // the password in plaintext) + REFRESH_TOKEN (silent re-auth).
    // ------------------------------------------------------------------
    this.userPoolClient = new cognito.UserPoolClient(this, 'FatchadWebClient', {
      userPool: this.userPool,
      userPoolClientName: 'fatchad-web',
      generateSecret: false,
      authFlows: {
        userSrp: true,
        userPassword: false,
      },
      // Token validity — short access token, longer refresh window.
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // ------------------------------------------------------------------
    // Outputs
    // ------------------------------------------------------------------
    cdk.Tags.of(this).add('Project', 'FATCHAD');
    cdk.Tags.of(this).add('Component', 'auth');

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID — used by the backend to verify JWTs.',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID — used by the frontend SDK.',
    });

    new cdk.CfnOutput(this, 'UserPoolRegion', {
      value: this.region,
      description: 'AWS region of the User Pool — needed for frontend config.',
    });
  }
}
