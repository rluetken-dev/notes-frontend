// time.js
// Time helpers: now() and "time ago" in German
// -------------------------------------------------
// Provides tiny utilities for timestamps:
// - now(): current Unix time in milliseconds
// - timeAgo(ts): human-friendly relative time string (German)
//
// Design notes:
// - This is intentionally lightweight and locale-specific ('de-DE').
// - Granularity is approximate: seconds, minutes, hours, days, weeks,
//   months (~30 days), years (~365 days).
// - Suitable for UI labels like "Zuletzt geändert: …" and periodic refreshes.

/**
 * Get the current Unix timestamp in milliseconds.
 *
 * @returns {number} Current time (ms since epoch)
 */
export const now = () => Date.now();

// Shared relative time formatter for German locale.
// numeric: 'auto' means "yesterday", "last week", etc., when appropriate.
const rtf = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });

/**
 * Convert a timestamp (ms since epoch) to a friendly "time ago" string (German).
 *
 * Examples:
 *  - vor 2 Minuten
 *  - vor 3 Stunden
 *  - vor 5 Tagen
 *  - gerade eben   (for very recent times)
 *
 * @param {number} ts - Unix timestamp in milliseconds
 * @returns {string} Human-readable relative time string (German)
 *
 * Implementation details:
 * - Uses coarse thresholds:
 *   < 45s → "gerade eben"
 *   < 60m → minutes
 *   < 24h → hours
 *   < 7d  → days
 *   < 5w  → weeks
 *   < 12m → months (30-day approximation)
 *   else  → years  (365-day approximation)
 * - Negative values (future timestamps) will yield "in …" phrasing via rtf,
 *   but typical usage passes past timestamps.
 */
export function timeAgo(ts) {
  const diffMs = Date.now() - ts;
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return 'gerade eben';

  const min = Math.round(sec / 60);
  if (min < 60) return rtf.format(-min, 'minute');

  const hr = Math.round(min / 60);
  if (hr < 24) return rtf.format(-hr, 'hour');

  const day = Math.round(hr / 24);
  if (day < 7) return rtf.format(-day, 'day');

  const week = Math.round(day / 7);
  if (week < 5) return rtf.format(-week, 'week');

  const month = Math.round(day / 30); // ≈30-day months
  if (month < 12) return rtf.format(-month, 'month');

  const year = Math.round(day / 365); // ≈365-day years
  return rtf.format(-year, 'year');
}
