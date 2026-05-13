/**
 * Persistent user identity. No auth yet — we just stash a stable
 * `user_id` in localStorage so the same browser keeps its runs.
 */
const KEY = 'fatchad_user_id';

function generate(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `user_${rand}`;
}

export function getUserId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = generate();
    localStorage.setItem(KEY, id);
  }
  return id;
}
