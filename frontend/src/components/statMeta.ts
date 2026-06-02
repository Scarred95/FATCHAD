/**
 * Shared stat presentation — colors, labels, ordering.
 *
 * The gameplay UI references stats by CSS custom property (themed in
 * globals.css) rather than literal hex, so these maps live here instead of
 * `admin/types.ts` (which carries hex swatches for the editor). Single
 * source of truth for the player-facing components.
 */
import type { StatName } from '../api/types';

// Re-exported so stat presentation has one import surface for components.
export { MAIN_STAT_NAMES } from '../api/types';

/** Per-stat CSS custom property reference. */
export const STAT_COLOR_VAR: Record<StatName, string> = {
  moneten: 'var(--color-stat-moneten)',
  aura: 'var(--color-stat-aura)',
  respekt: 'var(--color-stat-respekt)',
  rizz: 'var(--color-stat-rizz)',
  chaos: 'var(--color-stat-chaos)',
};

/** Display labels (German). */
export const STAT_LABEL: Record<StatName, string> = {
  moneten: 'Moneten',
  aura: 'Aura',
  respekt: 'Respekt',
  rizz: 'Rizz',
  chaos: 'Chaos',
};
