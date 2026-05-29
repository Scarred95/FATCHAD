# app/routes/_deps.py
"""Shared FastAPI dependency providers.

Single source of truth for repo construction so every route grabs them the
same way. Add request-scoped logging / metrics here in one place later.
"""
from fastapi import Request

from app.db.repositories import EndingRepo, EventRepo, GameStateRepo


def get_state_repo(request: Request) -> GameStateRepo:
    return GameStateRepo(request.app.state.mongo.db)


def get_event_repo(request: Request) -> EventRepo:
    return EventRepo(request.app.state.mongo.db)


def get_ending_repo(request: Request) -> EndingRepo:
    return EndingRepo(request.app.state.mongo.db)
