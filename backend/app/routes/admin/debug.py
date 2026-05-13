# app/routes/admin/debug.py
"""Dev-only deck manipulation tools.

These routes let you manually inject or remove cards from a live run's deck,
which is useful for testing specific card sequences without replaying a full run.

All routes are prefixed /admin by the parent router in __init__.py.
TODO: Add authentication/authorization — these endpoints are currently open to anyone.
"""
import random
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.db.repositories import GameStateRepo

router = APIRouter()


def get_state_repo(request: Request) -> GameStateRepo:
    return GameStateRepo(request.app.state.mongo.db)


class InsertCardRequest(BaseModel):
    card_id: str
    position: Literal["top", "bottom", "shuffle"] = "top"


@router.post("/runs/{run_id}/deck", status_code=204)
async def insert_card_into_deck(
    run_id: str,
    payload: InsertCardRequest,
    states: GameStateRepo = Depends(get_state_repo),
):
    """Dev-only: manually inject a card into a run's deck. For testing."""
    state = await states.get(run_id)
    if state is None:
        raise HTTPException(404, "Run not found")

    if payload.position == "top":
        state.deck.insert(0, payload.card_id)
    elif payload.position == "bottom":
        state.deck.append(payload.card_id)
    elif payload.position == "shuffle":
        # Dev tool: uses global (unseeded) RNG — reproducibility not required here.
        idx = random.randrange(len(state.deck) + 1) if state.deck else 0
        state.deck.insert(idx, payload.card_id)

    await states.save(state)


@router.delete("/runs/{run_id}/deck/{index}", status_code=204)
async def remove_card_from_deck(
    run_id: str,
    index: int,
    states: GameStateRepo = Depends(get_state_repo),
):
    """Dev-only: remove a card from a run's deck by index."""
    state = await states.get(run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    if not (0 <= index < len(state.deck)):
        raise HTTPException(400, f"Index {index} out of range")
    state.deck.pop(index)
    await states.save(state)
