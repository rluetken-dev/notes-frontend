// utils.js
// Small generic helpers (ID + sanitization + sorting + search)
// ------------------------------------------------------------
// This module contains framework-agnostic utilities used across the app:
// - generateId(): best-effort unique IDs (prefers crypto.randomUUID)
// - escapeHtml(): minimal HTML entity escaping for safe innerHTML usage
// - byPinnedThenUpdated(): stable comparator for note ordering
// - matchesQuery(): simple case-insensitive text match in title/content

/**
 * Generate a reasonably unique ID string.
 *
 * Strategy:
 * - Prefer the browser's cryptographically strong UUID if available.
 * - Fallback: random base36 + timestamp fragment (good enough for local apps).
 *
 * Notes:
 * - For production-grade IDs across distributed systems, stick to UUID.
 * - Collision chance in the fallback is extremely low for this use-case.
 *
 * @returns {string} A unique-ish identifier
 */
export const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Escape a string for safe insertion via element.innerHTML.
 *
 * Important:
 * - If you are *not* injecting HTML (i.e., just text), prefer:
 *     node.textContent = value;
 *   which is inherently safe and usually faster.
 *
 * @param {string} s - Untrusted user input (title/content)
 * @returns {string} Escaped string with minimal HTML entities
 */
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

/**
 * Comparator for notes: pinned first, then by updatedAt (newest first).
 *
 * Usage:
 *   notes.slice().sort(byPinnedThenUpdated)
 *
 * @param {{ pinned?: boolean, updatedAt?: number }} a
 * @param {{ pinned?: boolean, updatedAt?: number }} b
 * @returns {number} Negative if a < b, positive if a > b, 0 if equal
 */
export function byPinnedThenUpdated(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1; // pinned items float to top
  return (b.updatedAt ?? 0) - (a.updatedAt ?? 0); // newer first
}

/**
 * Case-insensitive substring match against note title/content.
 *
 * Design:
 * - Simple "includes" search over lowercased title and content.
 * - Empty query matches everything.
 *
 * Extensions (future ideas):
 * - Add diacritic-insensitive search via String.prototype.normalize().
 * - Tokenize query (AND/OR), support #tags, or highlight matches.
 *
 * @param {{ title?: string, content?: string }} n - Note to test
 * @param {string} q - Raw query string (user input)
 * @returns {boolean} True if the note matches, false otherwise
 */
export function matchesQuery(n, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
}
