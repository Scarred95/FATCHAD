/* eslint-disable react/prop-types */
// FATCHAD — Game view, redone to mirror the real frontend's design.
// Ports: StatRow / StatBar / ChaosBar / Card (with useCardSwipe) / ChoiceButton / HintList.
// Loaded as a Babel JSX module. Exposes `GameView` to window.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─── Stat metadata ─────────────────────────────────────────────────────────
const STAT_KEYS = ["moneten", "aura", "respekt", "rizz"];
const STAT_LABEL = {
  moneten: "Moneten",
  aura: "Aura",
  respekt: "Respekt",
  rizz: "Rizz",
  chaos: "Chaos",
};
const STAT_COLOR_VAR = {
  moneten: "var(--color-stat-moneten)",
  aura:    "var(--color-stat-aura)",
  respekt: "var(--color-stat-respekt)",
  rizz:    "var(--color-stat-rizz)",
  chaos:   "var(--color-stat-chaos)",
};

// SVG icons — ported from StatIcon.tsx
function StatIcon({ stat, size = 16, color }) {
  const fill = color || STAT_COLOR_VAR[stat];
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" };
  const filled = { width: size, height: size, viewBox: "0 0 24 24", fill: "currentColor", stroke: "none" };
  return (
    <span style={{ color: fill, display: "inline-flex", lineHeight: 0 }} aria-label={stat}>
      {stat === "moneten" && (
        <svg {...common}><line x1="12" y1="2" x2="12" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
      )}
      {stat === "aura" && (
        <svg {...common}><circle cx="12" cy="12" r="3" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></svg>
      )}
      {stat === "respekt" && (
        <svg {...common}><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8S2 12 2 12z" /><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>
      )}
      {stat === "rizz" && (
        <svg {...filled}><path d="M12 21s-7-4.5-9.5-9C1 9 2 5 5.5 4.5 8 4 10 5.5 12 8c2-2.5 4-4 6.5-3.5C22 5 23 9 21.5 12 19 16.5 12 21 12 21z" /></svg>
      )}
      {stat === "chaos" && (
        <svg {...filled}><polygon points="13,2 3,14 11,14 9,22 21,10 13,10" /></svg>
      )}
    </span>
  );
}

// ─── Hint chip / list ─────────────────────────────────────────────────────
function HintChip({ stat, direction }) {
  if (direction === "hidden") return null;
  return (
    <span className="hintChip" data-dir={direction} style={{ "--stat-color": STAT_COLOR_VAR[stat] }}>
      <StatIcon stat={stat} size={12} color="currentColor" />
      <span className="arr">{direction === "up" ? "↑" : direction === "down" ? "↓" : "?"}</span>
    </span>
  );
}
const HINT_ORDER = ["moneten", "aura", "respekt", "rizz", "chaos"];
function HintList({ hints, align = "center" }) {
  if (!hints) return null;
  const visible = HINT_ORDER.filter((s) => hints[s] && hints[s] !== "hidden");
  if (!visible.length) return null;
  return (
    <div className={"hintList " + align}>
      {visible.map((s) => <HintChip key={s} stat={s} direction={hints[s]} />)}
    </div>
  );
}

// ─── StatBar ───────────────────────────────────────────────────────────────
function StatBar({ stat, value, delta }) {
  const danger = value <= 15 || value >= 85;
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => { if (delta && delta !== 0) setPulseKey((k) => k + 1); }, [delta]);
  return (
    <div className={"statWrap" + (danger ? " danger" : "")} style={{ "--stat-color": STAT_COLOR_VAR[stat] }}>
      <div className="statHead">
        <StatIcon stat={stat} size={16} />
        <span className="statValue">{value}</span>
      </div>
      <div className="statTrack">
        <div className="statFill" style={{ width: `${value}%` }} />
      </div>
      {delta !== undefined && delta !== 0 && (
        <span key={pulseKey} className={"statDelta " + (delta > 0 ? "pos" : "neg")}>
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}
      <span className="sr-only">{STAT_LABEL[stat]}: {value}</span>
    </div>
  );
}

function ChaosBar({ value, delta }) {
  const pct = Math.min(50, Math.abs(value) / 2);
  const direction = value >= 0 ? "pos" : "neg";
  const danger = Math.abs(value) >= 85;
  return (
    <div className={"statWrap chaosWrap" + (danger ? " danger" : "")} style={{ "--stat-color": STAT_COLOR_VAR.chaos }}>
      <div className="statHead">
        <StatIcon stat="chaos" size={16} />
        <span className="statValue">{value > 0 ? `+${value}` : value}</span>
      </div>
      <div className="chaosTrack">
        <div className="chaosCenter" />
        <div
          className={"chaosFill " + direction}
          style={{ width: `${pct}%`, left: direction === "pos" ? "50%" : `${50 - pct}%` }}
        />
      </div>
      {delta !== undefined && delta !== 0 && (
        <span className={"statDelta " + (delta > 0 ? "pos" : "neg")}>
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}
    </div>
  );
}

function StatRow({ stats, deltas }) {
  const deltaFor = (k) => deltas?.[k];
  return (
    <div className="statRow">
      {STAT_KEYS.map((k) => <StatBar key={k} stat={k} value={stats[k]} delta={deltaFor(k)} />)}
      <div className="statDivider" aria-hidden />
      <ChaosBar value={stats.chaos} delta={deltaFor("chaos")} />
    </div>
  );
}

// ─── Card art block ───────────────────────────────────────────────────────
function CardArt({ slug }) {
  // deterministic gradient per slug — quiet, doesn't compete with title
  const hash = (slug || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = (hash * 37) % 360;
  const hue2 = (hue + 35) % 360;
  const bg = `linear-gradient(${(hash * 11) % 180}deg, oklch(28% 0.06 ${hue}) 0%, oklch(20% 0.08 ${hue2}) 100%)`;
  const stripe = `repeating-linear-gradient(${(hash * 17) % 180}deg, rgba(255,255,255,.04) 0 2px, transparent 2px 11px)`;
  return (
    <div className="cardImage" style={{ background: bg }}>
      <div style={{ position: "absolute", inset: 0, background: stripe }} />
      <div className="cardCorner">
        <span>AKTE {(slug || "").slice(-4).toUpperCase()}</span>
        <span>FATCHAD</span>
      </div>
    </div>
  );
}

// ─── Reigns-style swipe — extended for 3-choice (down) ───────────────────
function useCardSwipe({ enabled, hasDown, onCommit }) {
  const ref = useRef(null);
  const [pose, setPose] = useState({ x: 0, y: 0, rot: 0, opacity: 1 });
  const [intent, setIntent] = useState(null); // 'left' | 'right' | 'down' | null
  const stateRef = useRef({ dragging: false, startX: 0, startY: 0, dx: 0, dy: 0, pointerId: null });
  const HCOMMIT = 90;
  const VCOMMIT = 90;
  const FLY = 700;

  const onPointerDown = (e) => {
    if (!enabled) return;
    ref.current?.setPointerCapture?.(e.pointerId);
    stateRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, pointerId: e.pointerId };
  };
  const onPointerMove = (e) => {
    const s = stateRef.current;
    if (!s.dragging || e.pointerId !== s.pointerId) return;
    let dx = e.clientX - s.startX;
    let dy = e.clientY - s.startY;
    if (dy < 0) dy = dy / 3;            // soft-resist upward drag
    if (!hasDown && dy > 0) dy = dy / 4; // resist down when no 3rd choice
    s.dx = dx; s.dy = dy;

    const rot = (dx / 320) * 14;
    setPose({ x: dx, y: dy, rot, opacity: 1 });

    if (hasDown && dy > Math.abs(dx) && dy >= VCOMMIT)        setIntent("down");
    else if (dx <= -HCOMMIT)                                   setIntent("left");
    else if (dx >=  HCOMMIT)                                   setIntent("right");
    else                                                       setIntent(null);
  };
  const flyOff = (dir, sx, sy) => {
    if (dir === "left")       setPose({ x: -FLY, y: sy * 1.2, rot: -22, opacity: 0 });
    else if (dir === "right") setPose({ x:  FLY, y: sy * 1.2, rot:  22, opacity: 0 });
    else                      setPose({ x: sx * 1.2, y: FLY,  rot:  sx / 30, opacity: 0 });
  };
  const onPointerUp = (e) => {
    const s = stateRef.current;
    if (!s.dragging || e.pointerId !== s.pointerId) return;
    s.dragging = false;
    if (!enabled) { setPose({ x: 0, y: 0, rot: 0, opacity: 1 }); setIntent(null); return; }

    if (hasDown && s.dy > VCOMMIT && s.dy > Math.abs(s.dx)) { flyOff("down",  s.dx, s.dy); onCommit?.(2); }
    else if (s.dx <= -HCOMMIT)                              { flyOff("left",  s.dx, s.dy); onCommit?.(0); }
    else if (s.dx >=  HCOMMIT)                              { flyOff("right", s.dx, s.dy); onCommit?.(1); }
    else { setPose({ x: 0, y: 0, rot: 0, opacity: 1 }); setIntent(null); }
  };

  return { ref, pose, intent, onPointerDown, onPointerMove, onPointerUp };
}

// ─── Card ─────────────────────────────────────────────────────────────────
function Card({ card, swipeable, hasDown, onCommit, onIntentChange, deckCount }) {
  const swipe = useCardSwipe({ enabled: !!swipeable, hasDown: !!hasDown, onCommit });
  useEffect(() => { onIntentChange?.(swipe.intent); }, [swipe.intent, onIntentChange]);

  const transition = swipe.pose.opacity === 0
    ? "transform 300ms cubic-bezier(.4,.1,.7,1), opacity 280ms ease-in"
    : "transform 320ms cubic-bezier(0.16, 1, 0.3, 1)";

  return (
    <div
      ref={swipe.ref}
      className="card"
      data-intent={
        swipe.intent === "left" ? "-1" :
        swipe.intent === "right" ? "1" :
        swipe.intent === "down" ? "down" : "0"
      }
      style={{
        transform: `translate(${swipe.pose.x}px, ${swipe.pose.y}px) rotate(${swipe.pose.rot}deg)`,
        transition,
        opacity: swipe.pose.opacity,
      }}
      onPointerDown={swipe.onPointerDown}
      onPointerMove={swipe.onPointerMove}
      onPointerUp={swipe.onPointerUp}
      onPointerCancel={swipe.onPointerUp}
    >
      <CardArt slug={card.id} />
      {typeof deckCount === "number" && (
        <div className="deckChip">Stapel · {String(deckCount).padStart(2, "0")}</div>
      )}

      <div className="cardBody">
        <h2 className="display cardTitle">{card.title}</h2>
        <p className="cardDesc">{card.description}</p>
      </div>

      <div className="cardFootHint">
        {hasDown ? "← Wische in eine Richtung. Auch nach unten. ↓" : "← Wische links oder rechts →"}
      </div>
    </div>
  );
}

// ─── ChoiceButton / OptionGutter ─────────────────────────────────────────
// Gutter sits to the left/right/bottom of the card, showing one option.
// Highlights when the user is dragging in its direction; tappable as fallback.
function OptionGutter({ position, choice, active, disabled, onClick }) {
  if (!choice) return <div className={"optionGutter " + position + " empty"} aria-hidden />;
  return (
    <button
      className={"optionGutter " + position + (active ? " active" : "")}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="optionArrow" aria-hidden>
        {position === "left" ? "←" : position === "right" ? "→" : "↓"}
      </span>
      <span className="optionText">{choice.text}</span>
      <HintList
        hints={choice.hints}
        align={position === "left" ? "end" : position === "right" ? "start" : "center"}
      />
    </button>
  );
}

// ─── Chaos ambient hook (writes --chaos / --chaos-signed) ─────────────────
function useChaosAmbient(chaos) {
  useEffect(() => {
    const el = document.documentElement;
    const c = typeof chaos === "number" ? chaos : 0;
    const signed = Math.max(-1, Math.min(1, c / 100));
    const mag = Math.abs(signed);
    el.style.setProperty("--chaos-signed", signed.toFixed(3));
    el.style.setProperty("--chaos", mag.toFixed(3));
    el.dataset.chaos = String(c);
    document.body.classList.toggle("chaosExtreme", Math.abs(c) >= 75);
    return () => {
      el.style.setProperty("--chaos-signed", "0");
      el.style.setProperty("--chaos", "0");
      el.dataset.chaos = "0";
      document.body.classList.remove("chaosExtreme");
    };
  }, [chaos]);
}

// ─── HEADER ───────────────────────────────────────────────────────────────
function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
function MenuDots() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
    </svg>
  );
}
function Header({ left, center, right }) {
  return (
    <header className="header">
      <div className="headerSlot">{left}</div>
      <div className="headerCenter">{center}</div>
      <div className="headerSlot end">{right}</div>
    </header>
  );
}
function IconButton({ label, onClick, children }) {
  return <button className="iconBtn" aria-label={label} onClick={onClick}>{children}</button>;
}

// ─── MODAL ────────────────────────────────────────────────────────────────
function Modal({ open, title, body, actions, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modalScrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {title && <div className="modalTitle">{title}</div>}
        {body && <div className="modalBody">{body}</div>}
        <div className="modalActions">
          {actions.map((a, i) => (
            <button
              key={i}
              className={a.variant === "primary" || a.variant === "danger" ? "btnPrimary" : "btnSecondary"}
              style={a.variant === "danger" ? { background: "var(--color-danger)" } : undefined}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Full-screen directional glow (X-pattern from center) ────────────────
function ScreenGlow({ intent, chaos, hasDown }) {
  const c = typeof chaos === "number" ? chaos : 0;
  const isPos = c > 0;
  const mag = Math.min(1, Math.abs(c) / 100);
  const topAlpha = 0.04 + mag * 0.4;
  const topRGB = c === 0 ? "255,255,255" : isPos ? "255,96,32" : "96,128,255";
  const topBg = `linear-gradient(to bottom, rgba(${topRGB},${topAlpha}) 0%, rgba(${topRGB},0) 65%)`;
  return (
    <div className="screenGlow" aria-hidden>
      <div className="gw glowTop" style={{ opacity: 1, background: topBg }} />
      <div className={"gw glowLeft"   + (intent === "left"  ? " on" : "")} />
      <div className={"gw glowRight"  + (intent === "right" ? " on" : "")} />
      {hasDown && <div className={"gw glowBottom" + (intent === "down" ? " on" : "")} />}
    </div>
  );
}

// ─── GAME VIEW ────────────────────────────────────────────────────────────
function GameView({ runId, onExit, onEnded }) {
  const [state, setState] = useState(() => window.FatchadAPI.getRun(runId));
  const [card, setCard] = useState(() => window.FatchadAPI.getCurrentCard(runId));
  const [intent, setIntent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [deltas, setDeltas] = useState(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useChaosAmbient(state?.stats?.chaos);

  const handleChoice = useCallback((idx) => {
    if (busy || !state || state.status !== "active" || !card) return;
    if (idx < 0 || idx >= card.choices.length) return;
    setBusy(true);

    const result = window.FatchadAPI.submitChoice(runId, idx);
    setDeltas(result.applied_effects);
    setState(result.state);

    // Delay the next-card swap so the swipe-fly + delta animation can play.
    setTimeout(() => {
      setCard(result.next_card);
      setIntent(0);
      setBusy(false);
    }, 280);

    if (result.state.status !== "active") {
      setTimeout(() => onEnded?.(result.state), 1400);
    }
  }, [busy, state, card, runId, onEnded]);

  if (!state) {
    return (
      <main className="page gamePage" style={{ alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--color-text-dim)" }}>Lauf nicht gefunden.</p>
      </main>
    );
  }

  const hasDown = !!card && card.choices.length >= 3;
  const swipeable = !!card && !busy;
  const ended = state.status !== "active";

  return (
    <main className="gamePage">
      <ScreenGlow intent={intent} chaos={state.stats.chaos} hasDown={hasDown} />

      <div className="gameTop">
        <Header
          left={<IconButton label="Zurück" onClick={() => setConfirmExit(true)}><BackArrow /></IconButton>}
          center={`Zug ${state.turn}`}
          right={<IconButton label="Menü" onClick={() => setMenuOpen(true)}><MenuDots /></IconButton>}
        />

        <StatRow stats={state.stats} deltas={deltas} />
      </div>

      <div className="cardArena" data-intent={intent || "none"}>
        <div className="cardRow">
          <OptionGutter
            position="left"
            choice={card?.choices[0]}
            active={intent === "left"}
            disabled={busy || !card}
            onClick={() => handleChoice(0)}
          />

          <div className="cardStack">
            {state.deck[2] && <div className="peek peek2" aria-hidden />}
            {state.deck[1] && <div className="peek peek1" aria-hidden />}

            {card ? (
              <Card
                key={card.id}
                card={card}
                swipeable={swipeable}
                hasDown={hasDown}
                onCommit={handleChoice}
                onIntentChange={setIntent}
                deckCount={state.deck.length}
              />
            ) : ended ? (
              <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-6)" }}>
                <p className="display" style={{ fontSize: "var(--fs-display-md)", textAlign: "center", color: "var(--color-accent)", textShadow: "0 0 24px var(--color-accent-glow)" }}>
                  Ende
                </p>
              </div>
            ) : (
              <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-6)" }}>
                <p style={{ color: "var(--color-text-dim)", fontStyle: "italic", textAlign: "center" }}>
                  Die Welt hält den Atem an…
                </p>
              </div>
            )}
          </div>

          <OptionGutter
            position="right"
            choice={card?.choices[1]}
            active={intent === "right"}
            disabled={busy || !card}
            onClick={() => handleChoice(1)}
          />
        </div>

        {hasDown && (
          <OptionGutter
            position="down"
            choice={card?.choices[2]}
            active={intent === "down"}
            disabled={busy || !card}
            onClick={() => handleChoice(2)}
          />
        )}
      </div>

      <Modal
        open={confirmExit}
        title="Schon aufgeben?"
        body="Verständlich. Dein Lauf bleibt gespeichert."
        actions={[
          { label: "Verlassen", variant: "primary", onClick: () => { setConfirmExit(false); onExit?.(); } },
          { label: "Weitermachen", variant: "ghost", onClick: () => setConfirmExit(false) },
        ]}
        onClose={() => setConfirmExit(false)}
      />
      <Modal
        open={menuOpen}
        title="Menü"
        actions={[
          { label: "Lauf aufgeben", variant: "danger", onClick: () => {
              setMenuOpen(false);
              window.FatchadAPI.abandonRun(runId);
              const s = window.FatchadAPI.getRun(runId);
              setState(s);
              setTimeout(() => onEnded?.(s), 600);
            }
          },
          { label: "Schließen", variant: "ghost", onClick: () => setMenuOpen(false) },
        ]}
        onClose={() => setMenuOpen(false)}
      />
    </main>
  );
}

// Expose for app.jsx
Object.assign(window, {
  GameView,
  Header, IconButton, BackArrow, MenuDots,
  Modal,
  StatIcon, HintList,
  useChaosAmbient,
  STAT_LABEL, STAT_COLOR_VAR,
});
