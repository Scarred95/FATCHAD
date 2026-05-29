"""Push Mongo-exported card / ending JSON into FATCHAD's DynamoDB.

Walks a source directory, routes files by name, validates every record
through Pydantic, and writes to `fatchad_catalog`. Synthesizes a `Deck`
row per deck so the catalog stays consistent (the Mongo export only
contained cards + endings, not decks themselves).

File routing:
  *endings*.json   → list of Ending  → SK = ENDING#<id>
  anything else    → list of Event   → SK = EVENT#<id>
                                    + 1 synthesized Deck per unique
                                      `deck_name` in the file
                                      → SK = DECK#<deck_name>

Usage (from backend/, with AWS creds in env):
    python scripts/merge_mongo_export.py
    python scripts/merge_mongo_export.py --src ../tmp
    python scripts/merge_mongo_export.py --dry-run
    python scripts/merge_mongo_export.py --src ../tmp --only tutorial.json

Idempotent: put_item overwrites by (PK, SK). Re-run as often as you want.
"""
import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import boto3
from pydantic import BaseModel, ValidationError

# Make `app` importable when running this script directly.
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.keys import (  # noqa: E402
    DdbKey,
    catalog_card_key,
    catalog_deck_key,
    catalog_ending_key,
)
from app.schemas import (  # noqa: E402
    Deck,
    DeckUnlockRule,
    Ending,
    Event,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("merge")

REGION = os.environ.get("AWS_REGION", "eu-central-1")
CATALOG_TABLE = os.environ.get("CATALOG_TABLE", "fatchad_catalog")
DEFAULT_SRC = Path(__file__).resolve().parents[2] / "tmp"

ENDING_NAME_HINT = "ending"


def to_item(model: BaseModel, key: DdbKey) -> dict:
    """Pydantic → flat DDB item dict. See scripts/seed_ddb.py for rationale."""
    payload = model.model_dump(by_alias=True, mode="json", exclude_none=True)
    payload.update(key)
    return payload


def now() -> datetime:
    return datetime.now(timezone.utc)


def load_json_array(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise ValueError(f"{path.name}: expected a JSON array, got {type(data).__name__}")
    return data


def is_endings_file(path: Path) -> bool:
    return ENDING_NAME_HINT in path.stem.lower()


def synthesize_deck(deck_name: str, card_count: int) -> Deck:
    """Build a Deck row from the deck_name present on its cards.

    Mongo export has no Deck collection — decks were implicit via the
    `deck_name` field on each card. We materialize them here so the
    catalog table has DECK# rows for every deck the cards reference.
    Description is a placeholder; admins can edit it later via the
    (future) admin UI.
    """
    n = now()
    return Deck(
        name=deck_name,
        description=f"Imported from mongo export ({card_count} cards).",
        enabled=True,
        unlock_rule=DeckUnlockRule(kind="default"),
        created_at=n,
        updated_at=n,
    )


def parse_events(records: list[dict], source: str) -> list[Event]:
    """Validate each record as Event, skipping (with a loud log line)
    rather than aborting the whole batch on a single bad row."""
    out: list[Event] = []
    for i, rec in enumerate(records):
        try:
            out.append(Event.model_validate(rec))
        except ValidationError as exc:
            log.error("%s[%d] (%s) failed Event validation: %s",
                      source, i, rec.get("_id", "?"), exc.errors()[:2])
    return out


def parse_endings(records: list[dict], source: str) -> list[Ending]:
    out: list[Ending] = []
    for i, rec in enumerate(records):
        try:
            out.append(Ending.model_validate(rec))
        except ValidationError as exc:
            log.error("%s[%d] (%s) failed Ending validation: %s",
                      source, i, rec.get("_id", "?"), exc.errors()[:2])
    return out


def collect_decks(events: list[Event]) -> list[Deck]:
    """One Deck row per unique deck_name, ignoring events with no deck."""
    by_name: dict[str, int] = {}
    for e in events:
        if e.deck_name:
            by_name[e.deck_name] = by_name.get(e.deck_name, 0) + 1
    return [synthesize_deck(name, count) for name, count in by_name.items()]


def write_batch(table, items: list[tuple[DdbKey, BaseModel]]) -> None:
    """Use DDB's batch_writer — it auto-batches at 25/req and retries
    unprocessed items. Empty input is a no-op."""
    if not items:
        return
    with table.batch_writer() as batch:
        for key, model in items:
            batch.put_item(Item=to_item(model, key))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", type=Path, default=DEFAULT_SRC,
                        help=f"Source directory of JSON files (default: {DEFAULT_SRC})")
    parser.add_argument("--only", nargs="+", default=None,
                        help="Optional: only process these filenames")
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate + count, don't write to DDB")
    args = parser.parse_args()

    src: Path = args.src.resolve()
    if not src.is_dir():
        sys.exit(f"source dir not found: {src}")

    files = sorted(src.glob("*.json"))
    if args.only:
        wanted = set(args.only)
        files = [f for f in files if f.name in wanted]
    if not files:
        sys.exit(f"no JSON files matched in {src}")

    log.info("source: %s", src)
    log.info("files:  %s", [f.name for f in files])
    log.info("target: %s (%s) %s", CATALOG_TABLE, REGION,
             "[DRY RUN]" if args.dry_run else "")

    dynamodb = boto3.resource("dynamodb", region_name=REGION) if not args.dry_run else None
    table = dynamodb.Table(CATALOG_TABLE) if dynamodb else None

    totals = {"decks": 0, "cards": 0, "endings": 0, "errors_skipped": 0}

    for f in files:
        records = load_json_array(f)

        if is_endings_file(f):
            endings = parse_endings(records, f.name)
            totals["errors_skipped"] += len(records) - len(endings)
            log.info("%s → %d endings", f.name, len(endings))
            if not args.dry_run:
                write_batch(table, [(catalog_ending_key(e.id), e) for e in endings])
            totals["endings"] += len(endings)
            continue

        events = parse_events(records, f.name)
        totals["errors_skipped"] += len(records) - len(events)
        decks = collect_decks(events)
        log.info("%s → %d cards, %d deck(s): %s",
                 f.name, len(events), len(decks), [d.name for d in decks])
        if not args.dry_run:
            write_batch(table, [(catalog_deck_key(d.name), d) for d in decks])
            write_batch(table, [(catalog_card_key(e.id), e) for e in events])
        totals["cards"] += len(events)
        totals["decks"] += len(decks)

    log.info("--- summary ---")
    log.info("decks written:    %d", totals["decks"])
    log.info("cards written:    %d", totals["cards"])
    log.info("endings written:  %d", totals["endings"])
    if totals["errors_skipped"]:
        log.warning("validation errors (skipped): %d", totals["errors_skipped"])
    if args.dry_run:
        log.info("dry run — nothing was written")


if __name__ == "__main__":
    main()
