// In-memory mock of the FATCHAD backend. Persists to localStorage.
// Mirrors the API shapes from API.md / DATA_SHAPES.md just well enough
// for the prototype to feel real.

(function () {
  const LS_KEY = "fatchad_runs_v1";
  const USER_KEY = "fatchad_user_v1";

  function uid(prefix = "run") {
    return `${prefix}_${Math.random().toString(36).slice(2, 14)}`;
  }
  function nowIso() { return new Date().toISOString(); }

  // ------- storage -------
  function loadAll() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
    catch { return {}; }
  }
  function saveAll(map) { localStorage.setItem(LS_KEY, JSON.stringify(map)); }

  function saveRun(state) {
    const all = loadAll();
    state.updated_at = nowIso();
    all[state._id] = state;
    saveAll(all);
  }

  // ------- card lookup -------
  function cardById(id) {
    return window.FATCHAD_CARDS.find((c) => c.id === id) || null;
  }

  // Pick a random card not already in deck/scheduled/recent history.
  function pickFresh(state) {
    const used = new Set([
      ...state.deck,
      ...state.scheduled.map((s) => s.card_id),
      ...state.history.slice(-8).map((h) => h.event_id), // avoid immediate repeats
    ]);
    const pool = window.FATCHAD_CARDS.filter((c) => !used.has(c.id));
    if (pool.length === 0) {
      // fall back to anything not on deck right now
      const fallback = window.FATCHAD_CARDS.filter((c) => !state.deck.includes(c.id));
      if (fallback.length === 0) return null;
      return fallback[Math.floor(Math.random() * fallback.length)].id;
    }
    return pool[Math.floor(Math.random() * pool.length)].id;
  }

  function refillDeck(state) {
    const TARGET = 8;
    while (state.deck.length < TARGET) {
      const id = pickFresh(state);
      if (!id) break;
      state.deck.push(id);
    }
  }

  // ------- ending check -------
  function checkEndings(state, choice) {
    if (choice.triggers_ending) {
      state.status = "won";
      state.ending = choice.triggers_ending;
      return;
    }
    const s = state.stats;
    if (s.moneten <= 0)   { state.status = "lost"; state.ending = "death_bankrupt"; return; }
    if (s.moneten >= 100) { state.status = "lost"; state.ending = "death_revolution"; return; }
    if (s.aura <= 0)      { state.status = "lost"; state.ending = "death_irrelevant"; return; }
    if (s.aura >= 100)    { state.status = "lost"; state.ending = "death_jumped_shark"; return; }
    if (s.respekt <= 0)   { state.status = "lost"; state.ending = "death_couped"; return; }
    if (s.respekt >= 100) { state.status = "lost"; state.ending = "death_conspiracy"; return; }
    if (s.rizz <= 0)      { state.status = "lost"; state.ending = "death_frozen_out"; return; }
    if (s.rizz >= 100)    { state.status = "lost"; state.ending = "death_drowned_in_drama"; return; }
    if (s.chaos >= 100)   { state.status = "won"; state.ending = "chaos_agent"; return; }
    if (s.chaos <= -100)  { state.status = "won"; state.ending = "grey_eminence"; return; }
  }

  // ------- effect derivation -------
  // Cards in the prototype carry only `hints`. Convert hints to plausible
  // stat deltas (small for known direction, random magnitude + sign for ?).
  function effectsFromHints(hints) {
    const eff = { moneten: 0, aura: 0, respekt: 0, rizz: 0, chaos: 0 };
    for (const [stat, hint] of Object.entries(hints || {})) {
      if (hint === "up")        eff[stat] = 6 + Math.floor(Math.random() * 9);   // +6..+14
      else if (hint === "down") eff[stat] = -(6 + Math.floor(Math.random() * 9));
      else if (hint === "unknown") {
        const mag = 8 + Math.floor(Math.random() * 12);
        eff[stat] = Math.random() < 0.5 ? -mag : mag;
      }
    }
    return eff;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ------- public API -------
  const api = {
    getCurrentUser() {
      return localStorage.getItem(USER_KEY) || null;
    },
    login(userId) {
      localStorage.setItem(USER_KEY, userId);
      return userId;
    },
    logout() {
      localStorage.removeItem(USER_KEY);
    },

    listRuns(userId) {
      const all = loadAll();
      return Object.values(all)
        .filter((r) => r.user_id === userId)
        .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    },

    createRun(userId) {
      const state = {
        _id: uid("run"),
        user_id: userId,
        deck: [],
        scheduled: [],
        stats: { moneten: 50, aura: 50, respekt: 50, rizz: 50, chaos: 0 },
        flags: [],
        history: [],
        turn: 0,
        rng_seed: Math.floor(Math.random() * 2 ** 31),
        status: "active",
        ending: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      // Always open with the tutorial card.
      state.deck.push("evt_tut_awakening");
      refillDeck(state);
      saveRun(state);

      const card = cardById(state.deck[0]);
      return { state, next_card: card };
    },

    getRun(runId) {
      return loadAll()[runId] || null;
    },

    getCurrentCard(runId) {
      const s = this.getRun(runId);
      if (!s || s.status !== "active") return null;
      if (s.deck.length === 0) refillDeck(s);
      return cardById(s.deck[0]);
    },

    submitChoice(runId, choiceIndex) {
      const state = this.getRun(runId);
      if (!state) throw new Error("not found");
      if (state.status !== "active") throw new Error("ended");
      const card = cardById(state.deck[0]);
      if (!card) throw new Error("no card");
      const choice = card.choices[choiceIndex];
      if (!choice) throw new Error("bad choice index");

      // 1. consume top
      state.deck.shift();

      // 2. apply stat effects
      const eff = effectsFromHints(choice.hints);
      state.stats.moneten = clamp(state.stats.moneten + eff.moneten, 0, 100);
      state.stats.aura    = clamp(state.stats.aura    + eff.aura,    0, 100);
      state.stats.respekt = clamp(state.stats.respekt + eff.respekt, 0, 100);
      state.stats.rizz    = clamp(state.stats.rizz    + eff.rizz,    0, 100);
      state.stats.chaos   = clamp(state.stats.chaos   + eff.chaos, -100, 100);

      // 3. history + turn
      state.history.push({ event_id: card.id, choice: choiceIndex, turn: state.turn, applied: eff });
      state.turn += 1;

      // 4. refill
      refillDeck(state);

      // 5. check endings
      checkEndings(state, choice);

      saveRun(state);
      const next = state.status === "active" ? cardById(state.deck[0]) : null;
      return { state, next_card: next, applied_effects: eff };
    },

    abandonRun(runId) {
      const state = this.getRun(runId);
      if (!state) return null;
      if (state.status !== "active") return state;
      state.status = "abandoned";
      saveRun(state);
      return state;
    },

    deleteRun(runId) {
      const all = loadAll();
      delete all[runId];
      saveAll(all);
    },
  };

  window.FatchadAPI = api;
})();
