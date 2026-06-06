import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * Provisions the three DynamoDB tables that hold all FATCHAD data.
 *
 * Three tables, splitting them lets us:
 *  - destroy/rebuild the catalog table during dev without touching users
 *  - scope IAM per-Lambda (publish writes catalog, gameplay writes users)
 *  - give each table its own stream consumer (publish vs leaderboard agg.)
 *  - keep the public leaderboards on their own partition space, cleanly
 *    separated from per-user data (different access pattern + read profile)
 *
 * Each table uses a single-table design within its own scope: one PK,
 * one SK, all entity types encoded into the SK prefix.
 *
 * ============================================================
 *  fatchad_catalog — admin-managed content (this is "the game")
 * ============================================================
 *
 *  PK         SK                  Item
 *  --------   -----------------   --------------------------------
 *  DECK       <deck_name>         Deck { name, description, enabled,
 *                                        unlock_rule, ... }
 *  EVENT      <card_id>           Card { id, deck_name, title, choices[],
 *                                        effects[], requires, sets_flags,
 *                                        clears_flags, triggers_ending,
 *                                        weight, enabled, ... }
 *  ENDING     <ending_id>         Ending { id, deck_name, title,
 *                                          description, trigger_conditions,
 *                                          enabled, ... }
 *  ACH        <ach_id>            Achievement { id, name, criteria,
 *                                               points, unlocks_deck,
 *                                               enabled, ... }
 *  META       current             Pointer { version, published_at }
 *                                           (bundle keys derived from version)
 *
 *  One PK per entity type, not a single PK="CATALOG". The classic single-
 *  table trick (one Query returns parent + children together) buys nothing
 *  here because catalog has no parent/child fetches at runtime — gameplay
 *  reads from a cached snapshot, not DDB. Per-type PKs make admin listings
 *  trivial (Query pk=EVENT) and spread load across partitions.
 *
 *  META is a catch-all PK for catalog-wide singletons. Today: just the
 *  publish pointer. Later: schema version, publish history, feature flags.
 *
 *  Note: Deck, Card, Ending, AND Achievement all carry an `enabled` boolean.
 *  Publishing strips disabled items from the public bundle, so an admin can
 *  stage edits and toggle visibility without deleting working copies. A
 *  disabled item still exists in the editor, it just doesn't ship to players
 *  on the next Publish.
 *
 *  Effective-enabled is computed at publish time:
 *      item.enabled AND parent_deck.enabled
 *  So toggling a whole deck off cascades to all its cards/endings without
 *  needing to touch the individual items.
 *
 *  Common queries:
 *    List all decks    →  Query pk=DECK
 *    List all cards    →  Query pk=EVENT
 *    List all endings  →  Query pk=ENDING
 *    Get one card      →  GetItem pk=EVENT, sk=<id>
 *    Get pointer       →  GetItem pk=META,  sk=current
 *    Whole catalog     →  Scan (table is small — a few hundred items max)
 *
 * ============================================================
 *  fatchad_user_data — per-user state
 * ============================================================
 *
 *  PK              SK                         Item
 *  -------------   ------------------------   ----------------------------
 *  USER#<uid>      PROFILE                    Profile { display_name, totals,
 *                                                       current_points,
 *                                                       created_at }
 *  USER#<uid>      UNLOCK#DECK#<deck>         { unlocked_at, via_achievement }
 *  USER#<uid>      ACH#<ach_id>               { unlocked_at, progress }
 *  USER#<uid>      RUN#ACTIVE#<run_id>        full GameState (in progress)
 *  USER#<uid>      RUN#ENDED#<run_id>         GameState snapshot
 *                                             { outcome, score, turns,
 *                                               ended_at }
 *  USER#<uid>      RUN#ABANDONED#<run_id>     GameState snapshot
 *                                             { abandoned_at }
 *
 *  Common queries:
 *    Get profile        →  GetItem pk=USER#<uid>, sk=PROFILE
 *    Get active run     →  Query pk=USER#<uid>, sk begins_with "RUN#ACTIVE#"
 *    List archived runs →  Query pk=USER#<uid>, sk begins_with "RUN#ENDED#"
 *
 *  Why status-in-SK for runs?
 *    Encoding the run status into the SK ("RUN#ACTIVE#" vs "RUN#ENDED#")
 *    lets us fetch "the active run" as a prefix query — no filter, no scan.
 *    Ending a run is delete-old-key + put-new-key, two writes — cheaper
 *    than a status update plus a GSI lookup.
 *
 * ============================================================
 *  fatchad_leaderboard — public boards (points + run highscores)
 * ============================================================
 *
 *  PK              SK                         Item
 *  -------------   ------------------------   ----------------------------
 *  LB#points       SCORE#<padded10>#<uid>     LbPointsEntry { user_id,
 *                                                display_name, score,
 *                                                updated_at }
 *  LB#longest      SCORE#<padded10>#<run_id>  LbRunEntry { user_id,
 *                                                display_name, score, run_id,
 *                                                deck_ids, status, ending,
 *                                                published_at }
 *  LBRUN#<uid>     RUN#<run_id>               LbRunEntry (same body; per-user
 *                                                index so we can enforce the
 *                                                5-run cap + list "my runs"
 *                                                without scanning the board)
 *
 *  Common queries:
 *    Top 100 by points  →  Query pk=LB#points,  ScanIndexForward=false, Limit=100
 *    Top 100 by rounds  →  Query pk=LB#longest, ScanIndexForward=false, Limit=100
 *    A user's published  →  Query pk=LBRUN#<uid>, sk begins_with "RUN#"
 *
 *  Why a separate table?
 *    The boards are public, read-heavy, and have a totally different access
 *    pattern from per-user data. Splitting them keeps IAM + capacity reasoning
 *    clean and lets the per-user table stay private.
 *
 *  Why two rows per published run (board + LBRUN index)?
 *    The board row is score-sorted for top-N; the index row is keyed on
 *    run_id alone so we can enforce "max 5 runs per user" and offer a
 *    replace-picker without scanning the whole board. Publishing writes both;
 *    unpublishing deletes both. Score lives in the board SK, so changing a
 *    score is delete-old-SK + put-new-SK.
 *
 *  Why padded scores for leaderboards?
 *    DynamoDB sorts SKs lexicographically. Padding "42" → "0000000042"
 *    makes string sort agree with numeric sort, so top-100 is one Query
 *    call with ScanIndexForward=false. No client-side sort needed.
 *
 * ============================================================
 *  GSIs — none for v1
 * ============================================================
 *
 *  Every query above is satisfied by the base table. GSIs add cost and
 *  operational complexity. Add when a real access pattern proves it's
 *  needed (e.g. "cards filtered by deck without scanning" once we have
 *  several thousand cards).
 *
 * ============================================================
 *  Streams + consumers (Lambdas subscribed to the change-feed)
 * ============================================================
 *
 *  The catalog + user tables enable NEW_AND_OLD_IMAGES streams. Streams cost
 *  nothing until something consumes them — enabling now is free insurance.
 *  Consumer Lambdas land in a later step:
 *    - fatchad_catalog  stream → optional: cache-invalidation / audit
 *    - fatchad_user_data stream → optional aggregation / audit
 *  The leaderboard table is maintained by direct writes from the gameplay
 *  Lambda (points auto-sync + opt-in run publish), so it needs no stream.
 *
 *  Note: this is independent of the catalog → S3 publish flow. Publishing
 *  is an explicit admin action: a Lambda reads the whole catalog table,
 *  strips fields per audience, writes catalog_public.json + catalog_full.json
 *  to S3, and bumps the pointer item. Streams play no role in that.
 */
export class FatchadDataStack extends cdk.Stack {
  public readonly catalogTable: dynamodb.Table;
  public readonly userDataTable: dynamodb.Table;
  public readonly leaderboardTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- Catalog table (admin content) -----------------------------------
    // Removal policy DESTROY while in dev: it's all republishable from
    // local fixtures. Flip to RETAIN once a production publish flow people
    // care about exists.
    this.catalogTable = new dynamodb.Table(this, 'FatchadCatalogTable', {
      tableName: 'fatchad_catalog',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- User data table (profiles, runs, achievements, leaderboards) ----
    // Removal policy DESTROY for now — no real users yet. Switch to RETAIN
    // before the first real account is created. The day we forget to do
    // this will be the day someone accidentally `cdk destroy`s and we lose
    // history.
    this.userDataTable = new dynamodb.Table(this, 'FatchadUserDataTable', {
      tableName: 'fatchad_user_data',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- Leaderboard table (public boards) -------------------------------
    // Its own table so the public, read-heavy boards stay cleanly separated
    // from private per-user data. No stream: the gameplay Lambda writes it
    // directly (points auto-sync on achievement grants + opt-in run publish),
    // there is no aggregator to feed. DESTROY in dev like the others — the
    // board is fully rebuildable from run/profile data.
    this.leaderboardTable = new dynamodb.Table(this, 'FatchadLeaderboardTable', {
      tableName: 'fatchad_leaderboard',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- Tags so the bill is legible later -------------------------------
    cdk.Tags.of(this).add('Project', 'FATCHAD');
    cdk.Tags.of(this).add('Component', 'data');

    // --- Outputs (referenced by future backend stack + workflows) --------
    new cdk.CfnOutput(this, 'CatalogTableName', {
      value: this.catalogTable.tableName,
      description: 'DynamoDB table name for admin-managed content.',
    });
    new cdk.CfnOutput(this, 'CatalogTableArn', {
      value: this.catalogTable.tableArn,
      description: 'ARN of the catalog table (for IAM policies).',
    });
    new cdk.CfnOutput(this, 'CatalogTableStreamArn', {
      value: this.catalogTable.tableStreamArn ?? '',
      description: 'Stream ARN — feeds publish/cache-invalidation Lambdas.',
    });

    new cdk.CfnOutput(this, 'UserDataTableName', {
      value: this.userDataTable.tableName,
      description: 'DynamoDB table name for user profiles, runs, leaderboards.',
    });
    new cdk.CfnOutput(this, 'UserDataTableArn', {
      value: this.userDataTable.tableArn,
      description: 'ARN of the user data table (for IAM policies).',
    });
    new cdk.CfnOutput(this, 'UserDataTableStreamArn', {
      value: this.userDataTable.tableStreamArn ?? '',
      description: 'Stream ARN — reserved for future aggregation/audit consumers.',
    });

    new cdk.CfnOutput(this, 'LeaderboardTableName', {
      value: this.leaderboardTable.tableName,
      description: 'DynamoDB table name for the public points + run boards.',
    });
    new cdk.CfnOutput(this, 'LeaderboardTableArn', {
      value: this.leaderboardTable.tableArn,
      description: 'ARN of the leaderboard table (for IAM policies).',
    });
  }
}
