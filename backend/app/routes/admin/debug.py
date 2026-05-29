# app/routes/admin/debug.py
"""Dev-only deck manipulation — inject or remove cards from a live run's deck
without replaying a full run.

Mounted under /admin. Auth is enforced at the parent admin router.
"""
import random
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db.repositories import EventRepo, GameStateRepo
from app.routes._deps import get_event_repo, get_state_repo

router = APIRouter()


class InsertCardRequest(BaseModel):
    card_id: str
    position: Literal["top", "bottom", "shuffle"] = "top"


@router.post("/runs/{run_id}/deck", status_code=204)
async def insert_card_into_deck(
    run_id: str,
    payload: InsertCardRequest,
    states: GameStateRepo = Depends(get_state_repo),
    events: EventRepo = Depends(get_event_repo),
):
    """Dev-only: manually inject a card into a run's deck. For testing."""
    state = await states.get(run_id)
    if state is None:
        raise HTTPException(404, "Run not found")

    # Reject unknown card ids early — otherwise the inserted id quietly gets
    # dropped by _scan_top later, producing confusing "nothing happens" bugs.
    if await events.get_by_id(payload.card_id) is None:
        raise HTTPException(404, f"Card '{payload.card_id}' not found")

    if payload.position == "top":
        state.deck.insert(0, payload.card_id)
    elif payload.position == "bottom":
        state.deck.append(payload.card_id)
    elif payload.position == "shuffle":
        # Dev tool: uses global (unseeded) RNG — reproducibility not required here.
        idx = random.randrange(len(state.deck) + 1) if state.deck else 0
        state.deck.insert(idx, payload.card_id)

    if not await states.update(state):
        raise HTTPException(404, "Run not found")


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
    if not await states.update(state):
        raise HTTPException(404, "Run not found")
