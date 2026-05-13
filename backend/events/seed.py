"""Insert every card from events/*.json into MongoDB if it doesn't exist yet.

Existing documents are left untouched — this is an additive seed, not a sync.
For destructive re-seeding use scripts/seed_events.py --wipe.

Usage:
    python events/seed.py             # from backend/
    python seed.py                    # from backend/events/
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from pymongo import MongoClient

# Make `app` importable regardless of cwd.
HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
sys.path.insert(0, str(BACKEND))

from app.schemas import Event  # noqa: E402


def strip_jsonc_comments(text: str) -> str:
    """Remove // line comments and /* */ block comments while leaving string
    literals untouched. Tolerates the kind of inline notes the card authors
    leave in *.json / *.jsonc card files.
    """
    out: list[str] = []
    i, n = 0, len(text)
    in_str = False
    str_quote = ""
    while i < n:
        ch = text[i]
        if in_str:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == str_quote:
                in_str = False
            i += 1
            continue
        if ch in ('"', "'"):
            in_str = True
            str_quote = ch
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "/":
            i += 2
            while i < n and text[i] != "\n":
                i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            i += 2
            while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                i += 1
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def main() -> None:
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.getenv("MONGO_DB", "fatchad")
    client = MongoClient(mongo_url)
    events = client[db_name]["events"]

    existing_ids: set[str] = {doc["_id"] for doc in events.find({}, {"_id": 1})}

    inserted = 0
    skipped = 0
    failed = 0

    files = sorted(list(HERE.glob("*.json")) + list(HERE.glob("*.jsonc")))
    for json_file in files:
        if json_file.name.startswith("_"):
            continue  # convention: leading-underscore files are templates/notes
        with open(json_file, encoding="utf-8") as f:
            text = f.read()
        try:
            cards = json.loads(strip_jsonc_comments(text))
        except json.JSONDecodeError as e:
            failed += 1
            print(f"  FAIL {json_file.name}: invalid JSON — {e}")
            continue

        if not isinstance(cards, list):
            print(f"  SKIP {json_file.name}: not a JSON list")
            continue

        to_insert: list[dict] = []
        file_skipped = 0
        for i, raw in enumerate(cards):
            card_id = raw.get("_id") if isinstance(raw, dict) else None
            if card_id and card_id in existing_ids:
                file_skipped += 1
                continue
            try:
                card = Event(**raw)
                to_insert.append(card.model_dump(by_alias=True))
                existing_ids.add(card.id)
            except Exception as e:
                failed += 1
                print(f"  FAIL {json_file.name}[{i}]: {e}")

        if to_insert:
            events.insert_many(to_insert, ordered=False)
            inserted += len(to_insert)
        skipped += file_skipped
        print(f"  {json_file.name}: +{len(to_insert)} new, {file_skipped} already present")

    print(f"\nDone. Inserted {inserted}. Skipped {skipped}. Failed {failed}.")
    client.close()


if __name__ == "__main__":
    main()
