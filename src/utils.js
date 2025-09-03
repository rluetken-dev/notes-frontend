// utils.js
// Small generic helpers (ID + sanitization + sorting + search + #tags)
// --------------------------------------------------------------------
// New in this version:
// - extractTags(...parts): find unique #tags in given strings
// - parseQuery(q): split a search query into { text, tags[] }
// - matchesQuery(note, q): supports tag filters (#foo) + plain text

/**
 * Generate a reasonably unique ID string.
 *
 * Strategy:
 * - Prefer the browser's cryptographically strong UUID if available.
 * - Fallback: random base36 + timestamp fragment (good enough for local apps).
 */
export const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Escape a string for safe insertion via element.innerHTML.
 * If you can, prefer textContent over innerHTML to avoid injecting HTML at all.
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
 */
export function byPinnedThenUpdated(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
}

/**
 * Extract unique #tags from one or more text parts.
 *
 * Rules:
 * - Tags start with '#' and contain letters, digits, '_' or '-'
 * - Minimum length 2 (e.g., #go is ok; #a is ignored)
 * - Matching is ASCII-only here for simplicity; extend the regex for Unicode if needed.
 *
 * Examples:
 *   "Hello #work #Work" → ["work"]
 *   "Mix: (#dev), text#notatag" → ["dev"]
 */
export function extractTags(...parts) {
  const text = parts.filter(Boolean).join(' ');
  const set = new Set();
  const re = /(^|[\s.,;:!?([{\-])#([a-z0-9_-]{2,24})\b/gi;
  let m;
  while ((m = re.exec(text))) {
    set.add(m[2].toLowerCase());
  }
  return [...set];
}

/**
 * Parse a user query into plain text and tag filters.
 * Input: "urgent #work #inbox"
 * Output: { text: "urgent", tags: ["work","inbox"] }
 */
export function parseQuery(q) {
  q = (q || '').trim();
  if (!q) return { text: '', tags: [] };

  const tags = [];
  // Collect tags and strip them from the free-text part
  const text = q
    .replace(/(^|[\s])#([a-z0-9_-]{2,24})\b/gi, (_, s, tag) => {
      tags.push(tag.toLowerCase());
      return s; // keep spacing
    })
    .trim();

  return { text, tags };
}

/**
 * Case-insensitive match for notes with support for #tags.
 *
 * Rules:
 * - If query contains #tags, the note must contain **all** those tags
 *   (tags are extracted from note title + content).
 * - If query also has free text, we do a simple OR-substring match across
 *   title or content (case-insensitive).
 * - If query is empty, everything matches.
 */
export function matchesQuery(n, q) {
  const { text, tags } = parseQuery(q);

  // Tag filter: require ALL tags to be present in the note
  if (tags.length) {
    const noteTags = extractTags(n.title, n.content);
    for (const t of tags) if (!noteTags.includes(t)) return false;
  }

  // Free-text part: simple case-insensitive substring (title OR content)
  if (text) {
    const needle = text.toLowerCase();
    return (
      (n.title || '').toLowerCase().includes(needle) ||
      (n.content || '').toLowerCase().includes(needle)
    );
  }

  return true;
}
