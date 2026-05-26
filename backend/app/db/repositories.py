# app/db/repositories.py
import logging
from typing import Type, TypeVar

from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ValidationError

from app.schemas import Event, GameState

logger = logging.getLogger(__name__)

M = TypeVar("M", bound=BaseModel)


def _parse_or_skip(model_cls: Type[M], doc: dict, collection: str) -> M | None:
    """Validate a Mongo doc against a Pydantic model.

    On failure, log the doc's _id and return None so callers can skip the bad
    record instead of poisoning the whole batch. A schema regression should
    surface a few warnings, not a 500 on every read.
    """
    try:
        return model_cls(**doc)
    except ValidationError as exc:
        logger.warning(
            "Skipping malformed %s doc '%s': %s",
            collection, doc.get("_id"), exc,
        )
        return None


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create the indexes the app relies on. Idempotent — safe at every startup."""
    await db["events"].create_index("category")
    await db["game_states"].create_index("user_id")


class EventRepo:
    """Read/write access to the events collection.

    Reads dominate at runtime (game loop). Writes happen via admin endpoints
    and the seed script.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.coll = db["events"]

    # --- single-document reads ---

    async def get_by_id(self, event_id: str) -> Event | None:
        """Return the event, or None if missing OR malformed (logged)."""
        doc = await self.coll.find_one({"_id": event_id})
        if doc is None:
            return None
        return _parse_or_skip(Event, doc, "events")

    # --- batch reads ---

    async def get_many(self, ids: list[str]) -> list[Event]:
        """Fetch multiple cards by id in one query. Bad docs skipped."""
        if not ids:
            return []
        cursor = self.coll.find({"_id": {"$in": ids}})
        return [e async for doc in cursor if (e := _parse_or_skip(Event, doc, "events"))]

    async def get_by_categories(self, categories: list[str]) -> list[Event]:
        """Fetch every card whose category is in the given list. Bad docs skipped."""
        if not categories:
            return []
        cursor = self.coll.find({"category": {"$in": categories}})
        return [e async for doc in cursor if (e := _parse_or_skip(Event, doc, "events"))]

    async def list_ids_by_category(self, category: str) -> list[str]:
        """Lightweight projection — id-only, used to seed starter decks."""
        cursor = self.coll.find({"category": category}, {"_id": 1})
        return [doc["_id"] async for doc in cursor]

    async def list_paginated(
        self, category: str | None = None, limit: int = 100, skip: int = 0
    ) -> list[Event]:
        """Admin listing — full documents, optional category filter, paginated.
        Bad docs skipped (logged) so one broken card can't break the admin list."""
        query = {"category": category} if category else {}
        cursor = self.coll.find(query).skip(skip).limit(limit)
        return [e async for doc in cursor if (e := _parse_or_skip(Event, doc, "events"))]

    # --- writes (admin) ---

    async def insert(self, event: Event) -> None:
        await self.coll.insert_one(event.model_dump(by_alias=True))

    async def upsert(self, event: Event) -> None:
        await self.coll.replace_one(
            {"_id": event.id},
            event.model_dump(by_alias=True),
            upsert=True,
        )

    async def delete(self, event_id: str) -> bool:
        result = await self.coll.delete_one({"_id": event_id})
        return result.deleted_count > 0

    async def set_enabled_for_deck(
        self, deck_name: str, enabled: bool
    ) -> tuple[int, int]:
        """Bulk-update `enabled` on every card in a deck.

        `deck_name="__orphans__"` is the sentinel for cards with no deck_name
        set (or null). Matches the orphan bucket convention used in the admin UI.

        Returns (matched_count, modified_count). Modified can be less than
        matched if cards were already at the target enabled value.
        """
        if deck_name == "__orphans__":
            query: dict = {"$or": [
                {"deck_name": None},
                {"deck_name": {"$exists": False}},
            ]}
        else:
            query = {"deck_name": deck_name}

        result = await self.coll.update_many(query, {"$set": {"enabled": enabled}})
        return result.matched_count, result.modified_count


class GameStateRepo:
    """Read-write access to the game_states collection."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.coll = db["game_states"]

    async def get(self, run_id: str) -> GameState | None:
        """Return the run, or None if missing OR malformed (logged)."""
        doc = await self.coll.find_one({"_id": run_id})
        if doc is None:
            return None
        return _parse_or_skip(GameState, doc, "game_states")

    async def insert(self, state: GameState) -> None:
        """Insert a brand-new run document.

        Raises pymongo.errors.DuplicateKeyError if a run with this _id already
        exists — that's a real conflict (id collision or accidental re-insert),
        not something to paper over with an upsert.
        """
        await self.coll.insert_one(state.model_dump(by_alias=True))

    async def update(self, state: GameState) -> bool:
        """Replace an existing run document. Returns True if a doc was matched.

        Returns False if the run vanished between load and write (deleted by
        another request) — caller decides how to surface that (typically 404).
        Does NOT upsert: a missing _id stays missing, no zombie row gets created.
        """
        result = await self.coll.replace_one(
            {"_id": state.id},
            state.model_dump(by_alias=True),
            upsert=False,
        )
        return result.matched_count == 1

    async def delete(self, run_id: str) -> bool:
        result = await self.coll.delete_one({"_id": run_id})
        return result.deleted_count > 0

    async def list_for_user(self, user_id: str) -> list[GameState]:
        """Bad docs skipped (logged)."""
        cursor = self.coll.find({"user_id": user_id})
        return [s async for doc in cursor if (s := _parse_or_skip(GameState, doc, "game_states"))]

    async def list_summaries_for_user(self, user_id: str) -> list[dict]:
        """Projected query — fetches only the fields needed for RunSummary list views.
        Avoids pulling deck, history, flags, etc. over the wire for every run."""
        projection = {
            "_id": 1, "status": 1, "turn": 1, "stats": 1,
            "ending": 1, "created_at": 1, "updated_at": 1,
        }
        cursor = self.coll.find({"user_id": user_id}, projection)
        return [doc async for doc in cursor]
