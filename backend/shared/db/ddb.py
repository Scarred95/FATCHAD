"""Shared boto3 client/table singletons for both Lambdas.

Lazy-initialized at first use so importing this module doesn't require AWS
credentials in scope (eases local testing and import-time analysis).
Lambda containers reuse the same boto3 client across invocations — that's
the standard pattern for connection reuse and avoids the ~100 ms TLS
handshake cost on warm calls.

Env vars (with prod defaults):
  CATALOG_TABLE   default "fatchad_catalog"
  USER_TABLE      default "fatchad_user_data"
  CATALOG_BUCKET  default "fatchad-catalog"
  AWS_REGION      default "eu-central-1"   (Lambda sets this automatically)
"""
from __future__ import annotations

import os

import boto3

_DEFAULT_REGION = "eu-central-1"

_ddb_resource = None
_catalog_table = None
_user_table = None
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
    """Handle for the fatchad_user_data table (profile, runs, unlocks, lbs)."""
    global _user_table
    if _user_table is None:
        _user_table = _resource().Table(
            os.getenv("USER_TABLE", "fatchad_user_data")
        )
    return _user_table


def s3_client():
    """Single boto3 S3 client shared across this Lambda container."""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3", region_name=_region())
    return _s3_client


def catalog_bucket() -> str:
    """Bucket name for published catalog snapshots."""
    return os.getenv("CATALOG_BUCKET", "fatchad-catalog")
