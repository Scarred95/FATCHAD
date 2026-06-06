"""Shared boto3 client/table singletons for both Lambdas.

Lazy-initialized so import needs no AWS creds; reused across warm invocations
(standard connection-reuse pattern, avoids the TLS handshake per call).

Env (prod defaults): CATALOG_TABLE=fatchad_catalog, USER_TABLE=fatchad_user_data,
LEADERBOARD_TABLE=fatchad_leaderboard, CATALOG_BUCKET=fatchad-catalog,
AWS_REGION=eu-central-1 (Lambda sets it).
"""
from __future__ import annotations

import os

import boto3

_DEFAULT_REGION = "eu-central-1"

_ddb_resource = None
_catalog_table = None
_user_table = None
_leaderboard_table = None
_s3_client = None


def _region() -> str:
    return os.getenv("AWS_REGION", _DEFAULT_REGION)


def _resource():
    """Single boto3 DynamoDB resource shared across this Lambda container."""
    global _ddb_resource
    if _ddb_resource is None:
        _ddb_resource = boto3.resource("dynamodb", region_name=_region())
    return _ddb_resource


def catalog_table():
    """Handle for the fatchad_catalog table (cards, endings, decks, achs, pointer)."""
    global _catalog_table
    if _catalog_table is None:
        _catalog_table = _resource().Table(
            os.getenv("CATALOG_TABLE", "fatchad_catalog")
        )
    return _catalog_table


def user_table():
    """Handle for the fatchad_user_data table (profile, runs, unlocks, directory)."""
    global _user_table
    if _user_table is None:
        _user_table = _resource().Table(
            os.getenv("USER_TABLE", "fatchad_user_data")
        )
    return _user_table


def leaderboard_table():
    """Handle for the fatchad_leaderboard table (points + run boards). Kept
    separate from user data so board churn never contends with run writes."""
    global _leaderboard_table
    if _leaderboard_table is None:
        _leaderboard_table = _resource().Table(
            os.getenv("LEADERBOARD_TABLE", "fatchad_leaderboard")
        )
    return _leaderboard_table


def s3_client():
    """Single boto3 S3 client shared across this Lambda container."""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3", region_name=_region())
    return _s3_client


def catalog_bucket() -> str:
    """Bucket name for published catalog snapshots."""
    return os.getenv("CATALOG_BUCKET", "fatchad-catalog")
