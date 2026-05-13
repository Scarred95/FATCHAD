"""Seed the events collection from JSON files in events/.

Usage:
    python scripts/seed_events.py            # seed all events/*.json
    python scripts/seed_events.py --wipe     # wipe collection first

Run from the backend/ directory.
"""
import argparse
import json
import os
import sys
from pathlib import Path

from pymongo import MongoClient

# Make `app` importable when running this script directly
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.schemas import Event  # noqa: E402

EVENTS_DIR = Path(__file__).parent.parent / "events"


def main(wipe: bool) -> None:
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.getenv("MONGO_DB", "fatchad")
    client = MongoClient(mongo_url)
    db = client[db_name]
    events = db["events"]
    
    if wipe:
        deleted = events.delete_many({}).deleted_count
        print(f"Wiped {deleted} existing events.")
    
    total_loaded = 0
    total_failed = 0
    
    for json_file in sorted(EVENTS_DIR.glob("*.json")):
        with open(json_file, encoding="utf-8") as f:
            cards_data = json.load(f)
        
        if not isinstance(cards_data, list):
            print(f"  SKIP {json_file.name}: not a JSON list")
            continue
        
        validated: list[dict] = []
        for i, card_data in enumerate(cards_data):
            try:
                card = Event(**card_data)
                validated.append(card.model_dump(by_alias=True))
            except Exception as e:
                total_failed += 1
                print(f"  FAIL {json_file.name}[{i}]: {e}")
        
        if validated:
            for doc in validated:
                events.replace_one({"_id": doc["_id"]}, doc, upsert=True)
            total_loaded += len(validated)
            print(f"  OK   {json_file.name}: {len(validated)} cards")
    
    print(f"\nDone. Loaded {total_loaded} cards. Failed: {total_failed}.")
    
    # Show what's in the DB now
    by_category: dict[str, int] = {}
    for doc in events.find({}, {"category": 1}):
        by_category[doc["category"]] = by_category.get(doc["category"], 0) + 1
    print("By category:")
    for cat, count in sorted(by_category.items()):
        print(f"  {cat}: {count}")
    
    client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--wipe", action="store_true", help="Delete all events first")
    args = parser.parse_args()
    main(args.wipe)