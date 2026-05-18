/* eslint-disable react/prop-types */
// FATCHAD — top-level app + non-game screens.
// Mirrors the layout of /src/pages/{Title, RunList, EndScreen, About}.

const { useState, useEffect, useMemo, useCallback } = React;
const { Header, IconButton, BackArrow, MenuDots, Modal, StatIcon, HintList, useChaosAmbient, GameView } = window;

// ─── helpers ──────────────────────────────────────────────────────────────
const ENDING_LABEL = {
  chaos_agent: "Chaos Agent",
  grey_eminence: "Graue Eminenz",
  death_bankrupt: "Pleite",
  death_revolution: "Revolution",
  death_irrelevant: "Irrelevant",
  death_jumped_shark: "Jumped The Shark",
  death_couped: "Geputscht",
  death_conspiracy: "Verschwörung",
  death_frozen_out: "Ausgegrenzt",
  death_drowned_in_drama: "In Drama Ertrunken",
  softlock_no_cards: "Welt erstarrt"
};
const ENDING_FLAVOR = {
  chaos_agent: "Du hast die Welt in Brand gesteckt. Die Flammen tanzen für dich.",
  grey_eminence: "Niemand weiß, dass du dahinter stehst. Genau so wolltest du es.",
  death_bankrupt: "Pleite. Niemand nimmt deine Anrufe entgegen.",
  death_revolution: "Zu reich. Die Straßen brennen mit deinem Namen darauf.",
  death_irrelevant: "Niemand schaut mehr hin. Du bist verschwunden, ohne zu gehen.",
  death_jumped_shark: "Zu viel Aufmerksamkeit, zu wenig Substanz. Cringe ewig.",
  death_couped: "Andere haben gewartet. Andere waren besser vorbereitet.",
  death_conspiracy: "Zu viel Kontrolle. Selbst deine Verbündeten kippen.",
  death_frozen_out: "Niemand findet dich noch interessant. Auch du selbst nicht.",
  death_drowned_in_drama: "Jeder Tag ein Skandal. Irgendwann konnte niemand mehr folgen.",
  softlock_no_cards: "Die Welt hat aufgehört, dich zu brauchen."
};

function fmtRelative(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `vor ${Math.floor(diff / 86400)} T`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

// Player identity — auto-created so single-player feels immediate, but
// editable so the player can put their own name on the trophy case.
function ensureUser() {
  let u = window.FatchadAPI.getCurrentUser();
  if (!u) {
    u = "spieler_" + Math.random().toString(36).slice(2, 7);
    window.FatchadAPI.login(u);
  }
  return u;
}

// ─── TITLE ────────────────────────────────────────────────────────────────
function TitlePage({ user, runs, online, onNewRun, onContinue, onRuns, onAbout, onChangeName }) {
  const activeRun = runs.find((r) => r.status === "active");
  const hasRuns = runs.length > 0;

  return (
    <main className="page titlePage">
      <div className="titleAmbient" aria-hidden />

      <div className="logoBlock">
        <h1 className="display logo">
          F<span className="glitchA">A</span>TCH<span className="glitchA2">A</span>D
        </h1>
        <p className="tagline">Eine Welt. Vier Werte.Eine schlechte Idee nach der anderen.</p>
      </div>

      <div className="titleActions">
        <button className="btnPrimary" onClick={onNewRun}>Neue Runde</button>
        <button className="btnSecondary" onClick={onContinue} disabled={!activeRun}>
          {activeRun ? `Fortsetzen — Zug ${activeRun.turn}` : "Fortsetzen"}
        </button>
        <button className="btnSecondary" onClick={onRuns} disabled={!hasRuns}>
          Vergangene Läufe {hasRuns ? `(${runs.length})` : ""}
        </button>
        <button className="btnText" onClick={onAbout}>Über FATCHAD</button>
      </div>

      <div className="identityRow">
        <span>Du spielst als</span>
        <b>@{user}</b>
        <button onClick={onChangeName}>Ändern</button>
      </div>

      {online === false &&
      <div className="statusPill">Offline — Mock-Backend (LocalStorage)</div>
      }
    </main>);

}

// ─── NEW-RUN CONFIRMATION ─────────────────────────────────────────────────
function NewRunPage({ onConfirm, onCancel }) {
  return (
    <main className="page" style={{ justifyContent: "center", gap: "var(--space-5)" }}>
      <Header
        left={<IconButton label="Zurück" onClick={onCancel}><BackArrow /></IconButton>}
        center="Neue Runde" />
      
      <div style={{ textAlign: "center", padding: "var(--space-6) var(--space-3)" }}>
        <h2 className="display" style={{ fontSize: "var(--fs-display-lg)", marginBottom: "var(--space-4)" }}>
          Bist du <br /> sicher?
        </h2>
        <p style={{ color: "var(--color-text-dim)", maxWidth: "32ch", margin: "0 auto var(--space-6)" }}>
          Du startest mit 50/50/50/50. Vier Werte, ein Chaos-Index, kein Reset.
          Jede Karte zählt. Niemand drückt für dich.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <button className="btnPrimary" onClick={onConfirm}>Loslegen</button>
          <button className="btnText" onClick={onCancel}>Vielleicht später</button>
        </div>
      </div>
    </main>);

}

// ─── RUN LIST ─────────────────────────────────────────────────────────────
function dominantStat(stats) {
  const entries = Object.entries(stats).filter(([k]) => k !== "chaos");
  entries.sort((a, b) => Math.abs(b[1] - 50) - Math.abs(a[1] - 50));
  const [name, value] = entries[0];
  return `${name} ${value}`;
}
function statusLabel(s) {
  return s === "active" ? "aktiv" : s === "won" ? "gewonnen" : s === "lost" ? "verloren" : "aufgegeben";
}

function RunListPage({ user, onOpen, onBack, onNewRun }) {
  const [version, setVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const runs = useMemo(() => window.FatchadAPI.listRuns(user), [user, version]);

  const handleDelete = (r) => {
    setConfirmDelete(null);
    window.FatchadAPI.deleteRun(r._id);
    setVersion((v) => v + 1);
  };

  return (
    <main className="page">
      <Header
        left={<IconButton label="Zurück" onClick={onBack}><BackArrow /></IconButton>}
        center="Deine Runden" />
      

      {runs.length === 0 ?
      <div className="emptyRuns">
          <div style={{ fontSize: 64 }}>👑</div>
          <h2>Noch nichts verbockt</h2>
          <p>Noch keine schlechten Entscheidungen getroffen.<br />Worauf wartest du?</p>
          <button className="btnPrimary" onClick={onNewRun}>Neue Runde</button>
        </div> :

      <>
          <div className="runList">
            {runs.map((r) => {
            const ending = r.ending && ENDING_LABEL[r.ending];
            return (
              <div key={r._id} className="runCard" data-status={r.status} role="button" tabIndex={0} onClick={() => onOpen(r._id)}>
                  <span className="runDot" data-status={r.status} />
                  <div className="runMeta">
                    <span className="runTitle">
                      {ending || `Lauf ${r._id.slice(-4).toUpperCase()}`}
                    </span>
                    <span className="runSub">
                      Zug {r.turn} · {dominantStat(r.stats)} · {fmtRelative(r.updated_at)}
                    </span>
                    <div className="runStatBlips">
                      {["moneten", "aura", "respekt", "rizz"].map((k) =>
                    <span key={k} className="runStatBlip">
                          <i style={{ background: window.STAT_COLOR_VAR[k] }} />
                          {r.stats[k]}
                        </span>
                    )}
                      <span className="runStatBlip">
                        <i style={{ background: window.STAT_COLOR_VAR.chaos }} />
                        {r.stats.chaos > 0 ? "+" : ""}{r.stats.chaos}
                      </span>
                    </div>
                  </div>
                  <span className="runStatus">{statusLabel(r.status)}</span>
                  <span
                  role="button"
                  tabIndex={0}
                  aria-label="Löschen"
                  className="deleteBtn"
                  onClick={(e) => {e.stopPropagation();setConfirmDelete(r);}}>
                  ✕</span>
                </div>);

          })}
          </div>
          <button className="fixedCta" onClick={onNewRun}>+ Neue Runde</button>
        </>
      }

      <Modal
        open={!!confirmDelete}
        title="Wirklich löschen?"
        body={confirmDelete ? `Lauf ${confirmDelete._id.slice(-4).toUpperCase()} wird unwiderruflich entfernt.` : undefined}
        actions={[
        { label: "Löschen", variant: "danger", onClick: () => confirmDelete && handleDelete(confirmDelete) },
        { label: "Abbrechen", variant: "ghost", onClick: () => setConfirmDelete(null) }]
        }
        onClose={() => setConfirmDelete(null)} />
      
    </main>);

}

// ─── END SCREEN ───────────────────────────────────────────────────────────
function EndPage({ runId, onAgain, onMenu }) {
  const state = window.FatchadAPI.getRun(runId);
  useChaosAmbient(state?.stats?.chaos ?? 0);

  if (!state) {
    return (
      <main className="page" style={{ justifyContent: "center", alignItems: "center" }}>
        <p style={{ color: "var(--color-text-dim)" }}>Lauf nicht gefunden.</p>
        <button className="btnSecondary" onClick={onMenu}>Zurück</button>
      </main>);

  }

  const isWin = state.status === "won";
  const isLost = state.status === "lost";
  const endingLabel = state.ending ? ENDING_LABEL[state.ending] : null;
  const flavor =
  state.status === "abandoned" ?
  "Du hast aufgegeben. Niemand wird sich erinnern." :
  state.ending && ENDING_FLAVOR[state.ending] || "Eine Geschichte, die nur du noch erzählen kannst.";

  const share = () => {
    const text = `FATCHAD — ${endingLabel || state.status}\nZüge: ${state.turn} · Karten: ${state.history.length}\n` +
    `Moneten ${state.stats.moneten} · Aura ${state.stats.aura} · Respekt ${state.stats.respekt} · Rizz ${state.stats.rizz} · Chaos ${state.stats.chaos}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => window.__toast?.("In Zwischenablage kopiert"),
        () => window.__toast?.("Kopieren fehlgeschlagen", "error")
      );
    }
  };

  return (
    <main className="page endPage">
      <div className="endBanner" data-status={state.status}>
        <span className="endBannerLabel">
          {isWin ? "Sieg" : isLost ? "Niederlage" : "Abbruch"} · Zug {state.turn}
        </span>
        <h1 className={"display endTitle " + (isWin ? "win" : isLost ? "lost" : "")}>
          {endingLabel || (state.status === "abandoned" ? "Aufgegeben" : "Vorbei")}
        </h1>
      </div>

      <p className="endFlavor">{flavor}</p>

      <div className="endStatGrid">
        {["moneten", "aura", "respekt", "rizz", "chaos"].map((k) =>
        <div className="endStatRow" key={k}>
            <StatIcon stat={k} size={20} />
            <span className="name">{window.STAT_LABEL[k]}</span>
            <span className="val">{k === "chaos" ? (state.stats[k] > 0 ? "+" : "") + state.stats[k] : state.stats[k]}</span>
          </div>
        )}
        <div style={{ display: "flex", gap: "var(--space-5)", borderTop: "1px solid var(--color-text-faint)", paddingTop: "var(--space-3)", marginTop: "var(--space-2)" }}>
          <dl className="endMeta">
            <dt>Züge überlebt</dt>
            <dd>{state.turn}</dd>
          </dl>
          <dl className="endMeta">
            <dt>Karten gespielt</dt>
            <dd>{state.history.length}</dd>
          </dl>
        </div>
      </div>

      <div className="endActions">
        <button className="btnPrimary" onClick={onAgain}>Neue Runde</button>
        <button className="btnSecondary" onClick={share}>Teilen</button>
        <button className="btnText" onClick={onMenu}>Zum Hauptmenü</button>
      </div>
    </main>);

}

// ─── ABOUT ────────────────────────────────────────────────────────────────
function AboutPage({ onBack }) {
  return (
    <main className="page">
      <Header
        left={<IconButton label="Zurück" onClick={onBack}><BackArrow /></IconButton>}
        center="Über FATCHAD" />
      
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", padding: "var(--space-4) var(--space-2)" }}>
        <h1 className="display" style={{ fontSize: "var(--fs-display-lg)" }}>
          Wisch dich<br />durch die Welt.
        </h1>
        <p style={{ color: "var(--color-text-dim)", fontSize: "var(--fs-body-lg)" }}>
          FATCHAD ist ein Solo-Kartenspiel über schlechte Entscheidungen mit
          enormen Konsequenzen. Halte vier Werte zwischen 0 und 100. Halte den
          Chaos-Index unter Kontrolle — oder lass ihn explodieren, wenn dir
          danach ist.
        </p>
        <div>
          <h3 className="display" style={{ fontSize: "var(--fs-display-sm)", color: "var(--color-accent)", marginBottom: "var(--space-2)" }}>So wird gespielt</h3>
          <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", color: "var(--color-text-dim)" }}>
            <li>· 2 Optionen → wische links oder rechts (oder tippe).</li>
            <li>· 3 Optionen → tippe die richtige Karte.</li>
            <li>· Stat fällt auf 0 oder steigt auf 100 → Ende.</li>
            <li>· Chaos auf ±100 → ein anderes Ende.</li>
            <li>· Hinweise neben jeder Option deuten an, was sich ändert.</li>
          </ul>
        </div>
        <div>
          <h3 className="display" style={{ fontSize: "var(--fs-display-sm)", color: "var(--color-accent)", marginBottom: "var(--space-2)" }}>Werte</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {[
            ["moneten", "Was du dir leisten kannst, wen du dir leisten kannst."],
            ["aura", "Wie laut die Welt von dir spricht."],
            ["respekt", "Ob das Establishment dich noch grüßt."],
            ["rizz", "Ob du im richtigen Moment den richtigen Satz sagst."],
            ["chaos", "Wie viel von der Welt zu deinen Bedingungen läuft."]].
            map(([k, copy]) =>
            <div key={k} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
                <StatIcon stat={k} size={20} />
                <div>
                  <div className="display" style={{ fontSize: "var(--fs-display-sm)", color: window.STAT_COLOR_VAR[k] }}>{window.STAT_LABEL[k]}</div>
                  <div style={{ color: "var(--color-text-dim)", fontSize: "var(--fs-body-sm)" }}>{copy}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>);

}

// ─── NAME MODAL ───────────────────────────────────────────────────────────
function NameModal({ open, current, onSave, onClose }) {
  const [value, setValue] = useState(current || "");
  useEffect(() => {if (open) setValue(current || "");}, [open, current]);
  if (!open) return null;
  return (
    <div className="modalScrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalTitle">Dein Spielername</div>
        <div className="modalBody">Wird lokal gespeichert. Kein Server, kein Passwort.</div>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="z. B. helmuth_v"
          style={{
            padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            border: "var(--border-mid)",
            background: "var(--color-bg-elevated)",
            color: "var(--color-text)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--fs-body)",
            outline: "none"
          }}
          onKeyDown={(e) => {if (e.key === "Enter") onSave(value.trim());}} />
        
        <div className="modalActions">
          <button className="btnPrimary" onClick={() => onSave(value.trim())}>Speichern</button>
          <button className="btnText" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>);

}

// ─── TOAST VIEWPORT ──────────────────────────────────────────────────────
function ToastViewport() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    let nextId = 1;
    window.__toast = (msg, kind = "info") => {
      const id = nextId++;
      setToasts((ts) => [...ts, { id, msg, kind }]);
      setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 2400);
    };
  }, []);
  return (
    <div className="toastViewport">
      {toasts.map((t) =>
      <div key={t.id} className={"toast " + (t.kind === "error" ? "error" : "")}>{t.msg}</div>
      )}
    </div>);

}

// ─── ROOT ─────────────────────────────────────────────────────────────────
function App() {
  const [user, setUser] = useState(() => ensureUser());
  const [route, setRoute] = useState("title"); // title | newrun | runs | game | end | about
  const [runId, setRunId] = useState(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [runsVersion, setRunsVersion] = useState(0);

  const runs = useMemo(() => window.FatchadAPI.listRuns(user), [user, runsVersion, route]);
  const activeRun = runs.find((r) => r.status === "active");

  // Always reset ambient when leaving the game.
  useChaosAmbient(route === "title" || route === "newrun" || route === "about" || route === "runs" ? 0 : null);

  const goTitle = () => {setRunsVersion((v) => v + 1);setRoute("title");};

  const newRun = () => {
    const { state } = window.FatchadAPI.createRun(user);
    setRunId(state._id);
    setRoute("game");
  };

  const openRun = (id) => {
    const s = window.FatchadAPI.getRun(id);
    if (!s) return;
    setRunId(id);
    setRoute(s.status === "active" ? "game" : "end");
  };

  let view = null;
  if (route === "title") {
    view =
    <TitlePage
      user={user}
      runs={runs}
      online={false}
      onNewRun={() => setRoute("newrun")}
      onContinue={() => activeRun && openRun(activeRun._id)}
      onRuns={() => setRoute("runs")}
      onAbout={() => setRoute("about")}
      onChangeName={() => setNameOpen(true)} />;


  } else if (route === "newrun") {
    view = <NewRunPage onConfirm={newRun} onCancel={goTitle} />;
  } else if (route === "runs") {
    view =
    <RunListPage
      user={user}
      onOpen={openRun}
      onBack={goTitle}
      onNewRun={() => setRoute("newrun")} />;


  } else if (route === "about") {
    view = <AboutPage onBack={goTitle} />;
  } else if (route === "game") {
    view =
    <GameView
      runId={runId}
      onExit={goTitle}
      onEnded={() => setRoute("end")} />;


  } else if (route === "end") {
    view =
    <EndPage
      runId={runId}
      onAgain={newRun}
      onMenu={goTitle} />;


  }

  return (
    <>
      {view}
      <NameModal
        open={nameOpen}
        current={user}
        onSave={(v) => {
          const cleaned = (v || "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 20) || "spieler_" + Math.random().toString(36).slice(2, 5);
          window.FatchadAPI.login(cleaned);
          setUser(cleaned);
          setNameOpen(false);
          window.__toast?.(`Hallo, @${cleaned}.`);
        }}
        onClose={() => setNameOpen(false)} />
      
      <ToastViewport />
    </>);

}

ReactDOM.createRoot(document.getElementById("app")).render(<App />);