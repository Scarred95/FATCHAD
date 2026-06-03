"""Achievement evaluation — finalize-time, data-driven, sync.

Called once when a run transitions out of "active". Reads the published
achievement catalog, grades each enabled-and-not-yet-earned achievement
against the run state, and asks UserRepo to grant matches.

No DSL yet (matches schemas.AchievementCriteria's "free-form blob"
contract): each achievement's `criteria.payload` carries a `"type"` plus
type-specific keys, and `evaluate_predicate` dispatches. Unknown types
silently evaluate to False so an admin typo never auto-grants every
achievement.

Composition (`all_of` / `any_of` / `not_of`) lets simple typed predicates
combine without inventing a query language.

NO retroactive grading: this runs only when a run finishes, so achievements
added later never reach in-flight or already-finished runs. By design.
"""
from __future__ import annotations

from typing import Callable

from shared.db.catalog_snapshot import CatalogSnapshot
from shared.db.user_repo import UserRepo
from shared.schemas import Achievement, GameState

# Mirror of StatBlock's five axes — imported lazily would be cleaner, but a
# tuple constant here keeps the predicate hot path allocation-free.
_STAT_NAMES = ("moneten", "aura", "respekt", "rizz", "chaos")


# =============================================================================
# Group A — end-state predicates
# =============================================================================

def _p_ending_fired(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    return state.ending is not None and state.ending == p.get("ending_id")


def _p_ending_in(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    ids = p.get("ending_ids") or []
    return state.ending is not None and state.ending in ids


def _p_won(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    """True iff the run ended on a non-default ending. Default endings are the
    fallback "you died from low stats" ones — winning means a quest/threshold
    ending fired instead. Looked up via catalog so admins can flip an ending's
    default flag without re-defining 'won'."""
    if not state.ending:
        return False
    e = catalog.get_ending(state.ending)
    return e is not None and not e.default


def _p_min_stat(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    stat = p.get("stat")
    if stat not in _STAT_NAMES:
        return False
    return getattr(state.stats, stat) >= p.get("value", 0)


def _p_max_stat(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    stat = p.get("stat")
    if stat not in _STAT_NAMES:
        return False
    return getattr(state.stats, stat) <= p.get("value", 0)


def _p_all_stats_min(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    thr = p.get("value", 0)
    return all(getattr(state.stats, s) >= thr for s in _STAT_NAMES)


def _p_has_flag(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    return p.get("flag") in state.flags


def _p_has_all_flags(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    flags = p.get("flags") or []
    return all(f in state.flags for f in flags)


def _p_lacks_flag(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    return p.get("flag") not in state.flags


def _p_max_turns(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    return state.turn <= p.get("value", 0)


def _p_min_turns(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    return state.turn >= p.get("value", 0)


# =============================================================================
# Group B — history predicates (no stat-snapshot, that's PR-A3)
# =============================================================================

def _p_played_card(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    cid = p.get("card_id")
    needed = p.get("count", 1)
    if not cid:
        return False
    n = sum(1 for h in state.history if h.event_id == cid)
    return n >= needed


def _p_played_category_count(
    p: dict, state: GameState, catalog: CatalogSnapshot,
) -> bool:
    cat = p.get("category")
    needed = p.get("count", 1)
    if not cat:
        return False
    n = 0
    for h in state.history:
        c = catalog.get_card(h.event_id)
        if c is not None and c.category == cat:
            n += 1
    return n >= needed


def _p_played_deck_count(
    p: dict, state: GameState, catalog: CatalogSnapshot,
) -> bool:
    dname = p.get("deck_name")
    needed = p.get("count", 1)
    if not dname:
        return False
    n = 0
    for h in state.history:
        c = catalog.get_card(h.event_id)
        if c is not None and c.deck_name == dname:
            n += 1
    return n >= needed


# =============================================================================
# Group C — rolling / trail predicates (read the per-turn stat snapshot)
# =============================================================================
#
# These read HistoryEntry.stats — the post-effect snapshot stamped each turn
# (PR-A3). Entries without a snapshot (written before the field existed) are
# skipped for peak/trough/swing and BREAK the streak for stay_above/below, so
# a partially-migrated run never phantom-matches.

def _stat_values(state: GameState, stat: str) -> list[int]:
    """Snapshotted values of `stat` across the run, turn order, skipping any
    entry that predates the stats field."""
    return [
        getattr(h.stats, stat) for h in state.history if h.stats is not None
    ]


def _p_peak_stat(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    stat = p.get("stat")
    if stat not in _STAT_NAMES:
        return False
    vals = _stat_values(state, stat)
    return bool(vals) and max(vals) >= p.get("value", 0)


def _p_trough_stat(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    stat = p.get("stat")
    if stat not in _STAT_NAMES:
        return False
    vals = _stat_values(state, stat)
    return bool(vals) and min(vals) <= p.get("value", 0)


def _p_swing(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    """Peak-to-trough range of a stat across the whole run >= value."""
    stat = p.get("stat")
    if stat not in _STAT_NAMES:
        return False
    vals = _stat_values(state, stat)
    return bool(vals) and (max(vals) - min(vals)) >= p.get("value", 0)


def _longest_streak(
    state: GameState, stat: str, predicate,
) -> int:
    """Longest run of CONSECUTIVE turns whose snapshot satisfies `predicate`.
    A missing snapshot breaks the streak (can't assert the condition held)."""
    best = streak = 0
    for h in state.history:
        if h.stats is not None and predicate(getattr(h.stats, stat)):
            streak += 1
            best = max(best, streak)
        else:
            streak = 0
    return best


def _p_stay_above(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    stat = p.get("stat")
    if stat not in _STAT_NAMES:
        return False
    threshold = p.get("value", 0)
    return _longest_streak(state, stat, lambda v: v >= threshold) >= p.get("turns", 1)


def _p_stay_below(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    stat = p.get("stat")
    if stat not in _STAT_NAMES:
        return False
    threshold = p.get("value", 0)
    return _longest_streak(state, stat, lambda v: v <= threshold) >= p.get("turns", 1)


# =============================================================================
# Group E — composition
# =============================================================================

def _p_all_of(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    subs = p.get("of") or []
    return all(evaluate_predicate(s, state, catalog) for s in subs)


def _p_any_of(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    subs = p.get("of") or []
    return any(evaluate_predicate(s, state, catalog) for s in subs)


def _p_not_of(p: dict, state: GameState, catalog: CatalogSnapshot) -> bool:
    sub = p.get("of")
    return sub is not None and not evaluate_predicate(sub, state, catalog)


# =============================================================================
# Dispatch
# =============================================================================

_PREDICATES: dict[str, Callable[[dict, GameState, CatalogSnapshot], bool]] = {
    # Group A
    "ending_fired":          _p_ending_fired,
    "ending_in":             _p_ending_in,
    "won":                   _p_won,
    "min_stat":              _p_min_stat,
    "max_stat":              _p_max_stat,
    "all_stats_min":         _p_all_stats_min,
    "has_flag":              _p_has_flag,
    "has_all_flags":         _p_has_all_flags,
    "lacks_flag":            _p_lacks_flag,
    "max_turns":             _p_max_turns,
    "min_turns":             _p_min_turns,
    # Group B
    "played_card":           _p_played_card,
    "played_category_count": _p_played_category_count,
    "played_deck_count":     _p_played_deck_count,
    # Group C
    "peak_stat":             _p_peak_stat,
    "trough_stat":           _p_trough_stat,
    "swing":                 _p_swing,
    "stay_above":            _p_stay_above,
    "stay_below":            _p_stay_below,
    # Group E
    "all_of":                _p_all_of,
    "any_of":                _p_any_of,
    "not_of":                _p_not_of,
}


def evaluate_predicate(
    payload: dict | None,
    state: GameState,
    catalog: CatalogSnapshot,
) -> bool:
    """Dispatch a predicate payload against the run state. Unknown / malformed
    payloads return False — an admin typo never auto-grants everyone."""
    if not isinstance(payload, dict):
        return False
    fn = _PREDICATES.get(payload.get("type"))
    return fn(payload, state, catalog) if fn else False


# =============================================================================
# Public entry — call from the finalize sites
# =============================================================================

def evaluate_achievements(
    state: GameState,
    user_id: str,
    catalog: CatalogSnapshot,
    users: UserRepo,
) -> list[Achievement]:
    """Grade a just-finished run and grant any matching achievements.

    Guarded: returns [] for still-active runs (defence-in-depth — callers
    already check status, but the bug class of "evaluate mid-run" is severe
    enough to gate here too).

    For each enabled catalog achievement the user does NOT already own, runs
    its predicate; matches go through UserRepo.unlock_achievement (which is
    itself idempotent against TOCTOU races, so even a duplicate eval can't
    double-grant). Returns the Achievement docs that fired so callers can
    stash their ids on state.newly_unlocked for the end-screen.
    """
    if state.status == "active":
        return []

    already = set(users.list_user_achievements(user_id))
    unlocked: list[Achievement] = []
    for ach in catalog.get_achievements():
        if not ach.enabled or ach.id in already:
            continue
        if not evaluate_predicate(ach.criteria.payload, state, catalog):
            continue
        granted = users.unlock_achievement(
            user_id=user_id,
            ach_id=ach.id,
            points=ach.points,
            unlocks_deck=ach.unlocks_deck,
        )
        if granted:
            unlocked.append(ach)
    return unlocked
