"""Seed game-content collections from JSON files in events/.

Routes files by filename:
  *_endings.json  → validated as Ending, upserted into the `endings` collection
  anything else   → validated as Event,  upserted into the `events`  collection

Usage:
    python scripts/seed_events.py            # seed everything (idempotent upsert)
    python scripts/seed_events.py --wipe     # wipe both collections first

Run from the backend/ directory.
"""
import argparse
import fnmatch
import json
import os
import sys
from pathlib import Path
from typing import Type

from pydantic import BaseModel
from pymongo import MongoClient

# Make `app` importable when running this script directly
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.schemas import Ending, Event  # noqa: E402

EVENTS_DIR = Path(__file__).parent.parent / "events"
ENDING_FILE_GLOB = "*_endings.json"


def _route(json_file: Path) -> tuple[Type[BaseModel], str]:
    """Pick (Pydantic model, target collection) from a filename."""
    if fnmatch.fnmatch(json_file.name, ENDING_FILE_GLOB):
        return Ending, "endings"
    return Event, "events"


def main(wipe: bool) -> None:
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.getenv("MONGO_DB", "fatchad")
    client = MongoClient(mongo_url)
    db = client[db_name]

    if wipe:
        for coll_name in ("events", "endings"):
            deleted = db[coll_name].delete_many({}).deleted_count
            print(f"Wiped {deleted} existing docs from '{coll_name}'.")

    per_collection_loaded: dict[str, int] = {"events": 0, "endings": 0}
    total_failed = 0

    for json_file in sorted(EVENTS_DIR.glob("*.json")):
        with open(json_file, encoding="utf-8") as f:
            docs_data = json.load(f)

        if not isinstance(docs_data, list):
            print(f"  SKIP {json_file.name}: not a JSON list")
            continue

        model_cls, coll_name = _route(json_file)
        coll = db[coll_name]

        validated: list[dict] = []
        for i, doc_data in enumerate(docs_data):
            try:
                obj = model_cls(**doc_data)
                validated.append(obj.model_dump(by_alias=True))
            except Exception as e:
                total_failed += 1
                print(f"  FAIL {json_file.name}[{i}] as {model_cls.__name__}: {e}")

        if validated:
            for doc in validated:
                coll.replace_one({"_id": doc["_id"]}, doc, upsert=True)
            per_collection_loaded[coll_name] += len(validated)
            print(
                f"  OK   {json_file.name}: {len(validated)} → '{coll_name}' "
                f"({model_cls.__name__})"
            )

    total = sum(per_collection_loaded.values())
    print(f"\nDone. Loaded {total} docs. Failed: {total_failed}.")
    print(f"  events:  {per_collection_loaded['events']}")
    print(f"  endings: {per_collection_loaded['endings']}")

    # Show what's in the events DB now (by category — endings collection is flat)
    by_category: dict[str, int] = {}
    for doc in db["events"].find({}, {"category": 1}):
        by_category[doc.get("category", "<none>")] = (
            by_category.get(doc.get("category", "<none>"), 0) + 1
        )
    if by_category:
        print("\nEvents by category:")
        for cat, count in sorted(by_category.items()):
            print(f"  {cat}: {count}")

    ending_count = db["endings"].count_documents({})
    default_count = db["endings"].count_documents({"default": True})
    if ending_count:
        print(f"\nEndings: {ending_count} total ({default_count} default).")

    client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--wipe", action="store_true",
        help="Delete all docs from BOTH events and endings collections first",
    )
    args = parser.parse_args()
    main(args.wipe)
