// time.js
// Time helpers: now() and "time ago" in German

export const now = () => Date.now();

const rtf = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });

/** Convert timestamp to a friendly "time ago" string (German). */
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
  const month = Math.round(day / 30);
  if (month < 12) return rtf.format(-month, 'month');
  const year = Math.round(day / 365);
  return rtf.format(-year, 'year');
}
