// utils.js
// Small generic helpers (ID + sanitization + sorting + search)

export const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Escape HTML to avoid XSS when injecting user content. */
export function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[m]
  );
}

/** Sort: pinned first, then updatedAt desc. */
export function byPinnedThenUpdated(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
}

/** Case-insensitive match against title/content. */
export function matchesQuery(n, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
}
