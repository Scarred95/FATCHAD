/**
 * Recently-edited card tracker, persisted to localStorage.
 *
 * `markRecent(id)` is called from the store after a successful
 * upsertCard / duplicateCard, so the DecksIndex rail can surface the
 * cards you've most recently touched. Capped at MAX entries.
 */

const KEY = 'fatchad-admin-recents';
const MAX = 20;

export interface RecentEntry {
  id: string;
  at: number;
}

export function loadRecents(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as RecentEntry[]).filter(
      (e) => e && typeof e.id === 'string' && typeof e.at === 'number',
    );
  } catch {
    return [];
  }
}

function saveRecents(list: RecentEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function markRecent(id: string): void {
  if (!id) return;
  const now = Date.now();
  const list = loadRecents().filter((e) => e.id !== id);
  list.unshift({ id, at: now });
  saveRecents(list);
}

export function dropRecent(id: string): void {
  saveRecents(loadRecents().filter((e) => e.id !== id));
}

export function timeAgo(at: number, now = Date.now()): string {
  const diff = Math.max(0, now - at);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}
