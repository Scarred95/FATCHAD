# app/db/connection.py
import os
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase


class MongoConnection:
    """Manages the Motor client lifecycle.
    
    Created once at app startup, closed at shutdown.
    A single instance is shared across all requests via FastAPI's app.state.
    """
    
    def __init__(self, url: str, db_name: str):
        self._url = url
        self._db_name = db_name
        self._client: AsyncIOMotorClient | None = None
    
    async def connect(self) -> None:
        if self._client is not None:
            return
        self._client = AsyncIOMotorClient(self._url)
        # Trigger an actual connection so we fail fast if Mongo is down
        await self._client.admin.command("ping")
    
    async def disconnect(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

    async def ping(self) -> bool:
        """Liveness check — returns True if Mongo responds, False otherwise.
        Used by the /healthz endpoint."""
        if self._client is None:
            return False
        try:
            await self._client.admin.command("ping")
            return True
        except Exception:
            return False

    @property
    def db(self) -> AsyncIOMotorDatabase:
        if self._client is None:
            raise RuntimeError("MongoConnection is not connected. Call connect() first.")
        return self._client[self._db_name]


def make_connection_from_env() -> MongoConnection:
    """Read config from environment variables."""
    url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.getenv("MONGO_DB", "fatchad")
    return MongoConnection(url=url, db_name=db_name)