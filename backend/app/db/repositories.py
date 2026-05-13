# app/db/repositories.py
import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.schemas import Event, GameState

logger = logging.getLogger(__name__)


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create the indexes the app relies on. Idempotent — safe to call on every startup.

    Without these, the category-filtered card queries and per-user run lookups
    fall back to full collection scans.
    """
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
        doc = await self.coll.find_one({"_id": event_id})
        if doc is None:
            return None
        try:
            return Event(**doc)
        except Exception as exc:
            logger.error("Failed to deserialize Event '%s': %s", event_id, exc)
            raise

    # --- batch reads ---

    async def get_many(self, ids: list[str]) -> list[Event]:
        """Fetch multiple cards by id in one query. Order of results is not guaranteed."""
        if not ids:
            return []
        cursor = self.coll.find({"_id": {"$in": ids}})
        return [Event(**doc) async for doc in cursor]

    async def get_by_categories(self, categories: list[str]) -> list[Event]:
        """Fetch every card whose category is in the given list — single $in query."""
        if not categories:
            return []
        cursor = self.coll.find({"category": {"$in": categories}})
        return [Event(**doc) async for doc in cursor]

    async def list_ids_by_category(self, category: str) -> list[str]:
        """Lightweight projection — id-only, used to seed starter decks."""
        cursor = self.coll.find({"category": category}, {"_id": 1})
        return [doc["_id"] async for doc in cursor]

    async def list_paginated(
        self, category: str | None = None, limit: int = 100, skip: int = 0
    ) -> list[Event]:
        """Admin listing — full documents, optional category filter, paginated."""
        query = {"category": category} if category else {}
        cursor = self.coll.find(query).skip(skip).limit(limit)
        return [Event(**doc) async for doc in cursor]

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


class GameStateRepo:
    """Read-write access to the game_states collection."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.coll = db["game_states"]

    async def get(self, run_id: str) -> GameState | None:
        doc = await self.coll.find_one({"_id": run_id})
        if doc is None:
            return None
        try:
            return GameState(**doc)
        except Exception as exc:
            logger.error("Failed to deserialize GameState '%s': %s", run_id, exc)
            raise

    async def save(self, state: GameState) -> None:
        """Upsert the full document. Replaces existing or inserts new."""
        data = state.model_dump(by_alias=True)
        await self.coll.replace_one(
            {"_id": state.id},
            data,
            upsert=True,
        )

    async def delete(self, run_id: str) -> bool:
        result = await self.coll.delete_one({"_id": run_id})
        return result.deleted_count > 0

    async def list_for_user(self, user_id: str) -> list[GameState]:
        cursor = self.coll.find({"user_id": user_id})
        return [GameState(**doc) async for doc in cursor]

    async def list_summaries_for_user(self, user_id: str) -> list[dict]:
        """Projected query — fetches only the fields needed for RunSummary list views.
        Avoids pulling deck, history, flags, etc. over the wire for every run."""
        projection = {
            "_id": 1, "status": 1, "turn": 1, "stats": 1,
            "ending": 1, "created_at": 1, "updated_at": 1,
        }
        cursor = self.coll.find({"user_id": user_id}, projection)
        return [doc async for doc in cursor]
