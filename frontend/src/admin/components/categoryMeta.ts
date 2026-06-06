/**
 * Display metadata for card categories.
 *
 * Categories are free strings in the data — the canonical list lives in
 * `admin/types.ts` (ALL_CATEGORIES). We attach a label + accent colour for
 * each known one here so the Cards section can render colour-coded chips.
 * Unknown categories fall back to a neutral grey via `categoryMeta()`.
 */
import { ALL_CATEGORIES } from '../types';

interface CategoryMeta {
  label: string;
  color: string;
}

// Picked from the existing stat palette + a few neighbouring hues so chips
// stay on-brand with the rest of the admin surface.
const META: Record<string, CategoryMeta> = {
  // Refill (the core gameplay buckets)
  politik:  { label: 'Politik',  color: '#ff3e7f' },
  social:   { label: 'Sozial',   color: '#4ade80' },
  economy:  { label: 'Geld',     color: '#f0c040' },
  chaos:    { label: 'Chaos',    color: '#ff6020' },
  // Non-refill
  tutorial: { label: 'Tutorial', color: '#60d0f0' },
  ending:   { label: 'Ending',   color: '#c060f0' },
  // A few of the proposed categories the user is likely to surface first
  medien:   { label: 'Medien',   color: '#c060f0' },
  geld:     { label: 'Geld',     color: '#f0c040' },
  sozial:   { label: 'Sozial',   color: '#4ade80' },
  skandal:  { label: 'Skandal',  color: '#ff3e7f' },
  nacht:    { label: 'Nacht',    color: '#6080ff' },
  intro:    { label: 'Intro',    color: '#60d0f0' },
};

export function categoryMeta(key: string): CategoryMeta {
  return META[key] ?? { label: key, color: 'var(--color-text-faint)' };
}

/** All known categories, in the canonical order. Used to seed filter rows. */
export const KNOWN_CATEGORIES: string[] = [...ALL_CATEGORIES];
