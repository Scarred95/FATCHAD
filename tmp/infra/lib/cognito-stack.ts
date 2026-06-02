import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

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
