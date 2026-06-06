#!/usr/bin/env python3
"""Bulk-delete run records from the fatchad_user_data table.

Runs live at PK=USER#<uid>, SK=RUN#<STATUS>#<run_id> (STATUS = ACTIVE | ENDED |
ABANDONED). This clears old playthroughs (e.g. before a launch/reset) WITHOUT
touching profiles, deck unlocks, achievements, the user directory, or
leaderboards — none of those use the RUN# sort-key prefix.

Safety model:
  * Nothing is deleted unless you pass --yes. Without it (or with --dry-run) the
    script only counts the matching runs.
  * Scope down with --user (one player) and/or --status (one status).

The RUN# / status prefixes mirror UserSk in backend/shared/db/keys.py — kept
inline here so the script runs standalone without PYTHONPATH setup.

Examples:
  # Count every run in the table (no writes)
  python backend/scripts/delete_runs.py --dry-run

  # Delete ALL runs (every user, every status)
  python backend/scripts/delete_runs.py --yes

  # Delete only one user's abandoned runs
  python backend/scripts/delete_runs.py --user <cognito-sub> --status abandoned --yes
"""
from __future__ import annotations

import argparse
import os
import sys

import boto3
from boto3.dynamodb.conditions import Key

_RUN_PREFIX = "RUN#"
_STATUS_SK = {"active": "ACTIVE", "ended": "ENDED", "abandoned": "ABANDONED"}


def _sk_prefix(status: str | None) -> str:
    """RUN# for every run, or RUN#<STATUS># to narrow to one status partition."""
    return _RUN_PREFIX if status is None else f"{_RUN_PREFIX}{_STATUS_SK[status]}#"


def _iter_user_runs(table, user_id: str, prefix: str):
    """One user's runs via a Query on their partition (no table scan)."""
    kwargs = {
        "KeyConditionExpression": Key("PK").eq(f"USER#{user_id}")
        & Key("SK").begins_with(prefix),
        "ProjectionExpression": "PK, SK",
    }
    while True:
        resp = table.query(**kwargs)
        yield from resp.get("Items", [])
        lek = resp.get("LastEvaluatedKey")
        if not lek:
            return
        kwargs["ExclusiveStartKey"] = lek


def _iter_all_runs(table, prefix: str):
    """Every user's runs via a filtered Scan. Reads the whole table (the filter
    is applied after read) — fine for a one-off cleanup, not a hot path."""
    kwargs = {
        "FilterExpression": Key("SK").begins_with(prefix),
        "ProjectionExpression": "PK, SK",
    }
    while True:
        resp = table.scan(**kwargs)
        yield from resp.get("Items", [])
        lek = resp.get("LastEvaluatedKey")
        if not lek:
            return
        kwargs["ExclusiveStartKey"] = lek


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Bulk-delete run records from fatchad_user_data.",
    )
    ap.add_argument("--table", default=os.getenv("USER_TABLE", "fatchad_user_data"))
    ap.add_argument("--region", default=os.getenv("AWS_REGION", "eu-central-1"))
    ap.add_argument("--user", help="Only delete this Cognito sub's runs (Query, no scan).")
    ap.add_argument("--status", choices=sorted(_STATUS_SK), help="Only this run status.")
    ap.add_argument("--dry-run", action="store_true", help="Count matches; delete nothing.")
    ap.add_argument("--yes", action="store_true", help="Actually delete. Omit for a safe count.")
    args = ap.parse_args()

    table = boto3.resource("dynamodb", region_name=args.region).Table(args.table)
    prefix = _sk_prefix(args.status)

    scope = f"user={args.user}" if args.user else "ALL users"
    print(
        f"Table {args.table} ({args.region}) — runs: {scope}, "
        f"status={args.status or 'all'}"
    )

    source = (
        _iter_user_runs(table, args.user, prefix)
        if args.user
        else _iter_all_runs(table, prefix)
    )

    # No --yes (or an explicit --dry-run) → count only, never write.
    if args.dry_run or not args.yes:
        count = sum(1 for _ in source)
        if args.yes:  # --yes was given but --dry-run overrode it
            print(f"[dry-run] Would delete {count} run(s).")
        else:
            print(f"Matched {count} run(s). Re-run with --yes to delete.")
        return 0

    deleted = 0
    with table.batch_writer() as batch:
        for item in source:
            batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
            deleted += 1
            if deleted % 500 == 0:
                print(f"  …{deleted} deleted")
    print(f"Done. Deleted {deleted} run(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
