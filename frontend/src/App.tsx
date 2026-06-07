import { useLocation, useNavigationType, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import ToastViewport from './components/Toast/ToastViewport';
import WipBanner from './components/WipBanner/WipBanner';
import CRTEffect from 'vault66-crt-effect';
import 'vault66-crt-effect/dist/vault66-crt-effect.css';
import { useSettingsStore } from './stores/settingsStore';

export default function App() {
  // CRT chrome is user-configurable via the settings wheel (Visuals panel).
  // Each effect maps to its own independent prop. `enabled` is kept constantly
  // true on purpose: the lib renders a DIFFERENT tree when enabled flips
  // (Fragment vs wrapper divs), which would remount all children — closing any
  // open UI like the settings wheel. So we never toggle `enabled`; we toggle
  // the individual sub-effects instead, which are just className/sibling swaps.
  const crtScanlines = useSettingsStore((s) => s.crtScanlines);
  const crtScanlineOpacity = useSettingsStore((s) => s.crtScanlineOpacity);
  const crtSweep = useSettingsStore((s) => s.crtSweep);
  const crtGlow = useSettingsStore((s) => s.crtGlow);

  // Page transitions: a crossfade with directional drift. AnimatePresence with
  // mode="wait" fades the OLD page fully OUT before the new one fades + drifts
  // IN, so the switch never feels abrupt. The new page slides ~24px from the
  // side you navigated toward — PUSH (forward) from the right, POP (back) from
  // the left, REPLACE just fades. The offset is small on purpose: pages do
  // their own per-element slide-ins, and a big transform would visibly drag
  // position:fixed UI (settings cog, banner) along during the animation. Exit
  // is opacity-only so the outgoing page fades in place without a sideways jump.
  // Admin shares one key so navigating between admin sub-pages doesn't
  // remount/flash the admin layout + sidebar.
  const location = useLocation();
  const outlet = useOutlet();
  const navType = useNavigationType();
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const transitionKey = location.pathname.startsWith('/admin')
    ? 'admin'
    : location.pathname;
  const driftX = navType === 'POP' ? -24 : navType === 'PUSH' ? 24 : 0;

  return (
    <CRTEffect
      enabled
      theme="custom"
      sweepStyle="classic"
      sweepDuration={10}
      sweepThickness={10}
      scanlineOpacity={crtScanlineOpacity}
      scanlineThickness={2}
      scanlineGap={4}
      scanlineColor="rgb(244, 85, 255)"
      enableScanlines={crtScanlines}
      enableSweep={crtSweep}
      enableEdgeGlow={crtGlow}
      edgeGlowColor="rgba(94, 6, 103, 0.9)"
      edgeGlowSize={75}
    >
      <WipBanner />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={transitionKey}
          initial={reducedMotion ? false : { opacity: 0, x: driftX }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.22, ease: 'easeOut' }}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
      <ToastViewport />
    </CRTEffect>
  );
}
