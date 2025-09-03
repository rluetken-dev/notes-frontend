// backup.js
// JSON export/import helpers for Mini-Notes
// -------------------------------------------------
// Provides two main functions:
// - exportNotes(notes): triggers a JSON download with metadata + notes
// - parseImportedFile(file): reads & validates a JSON backup file
//
// Design notes:
// - Self-contained, zero dependencies.
// - Minimal schema validation: checks required fields on each note.
// - File name includes a timestamp for easy sorting.

const EXPORT_VERSION = 1;

/** Format a timestamp into YYYYMMDD-HHMMSS string. */
function formatStamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${YYYY}${MM}${DD}-${hh}${mm}${ss}`;
}

/** Trigger a file download for given filename + object payload. */
function downloadJSON(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Shallow schema check for a single note object. */
function isValidNote(n) {
  return (
    n &&
    typeof n.id === 'string' &&
    typeof n.title === 'string' &&
    typeof n.content === 'string' &&
    typeof n.pinned === 'boolean' &&
    Number.isFinite(n.createdAt) &&
    Number.isFinite(n.updatedAt)
  );
}

/** Validate an array of notes; returns filtered valid ones. */
function sanitizeNotesArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(isValidNote);
}

/**
 * Export notes to a JSON file with metadata.
 * @param {Array<any>} notes
 */
export function exportNotes(notes) {
  const safeNotes = sanitizeNotesArray(notes);
  const payload = {
    app: 'mini-notes',
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    notes: safeNotes,
  };
  const name = `mini-notes-${formatStamp()}.json`;
  downloadJSON(name, payload);
}

/**
 * Read and parse a .json file into notes, with basic validation.
 * @param {File} file - a File chosen from an <input type="file">
 * @returns {Promise<{notes: Array<any>, meta: any, error: string|null}>}
 */
export async function parseImportedFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Accept both full payload and raw array for flexibility.
    const maybeNotes = Array.isArray(data) ? data : data?.notes;
    const cleaned = sanitizeNotesArray(maybeNotes);

    if (!cleaned.length) {
      return { notes: [], meta: null, error: 'No valid notes found in file.' };
    }

    const meta = Array.isArray(data) ? { version: null } : { version: data?.version ?? null };
    return { notes: cleaned, meta, error: null };
  } catch {
    return { notes: [], meta: null, error: 'Invalid JSON file.' };
  }
}

/**
 * Merge two note arrays by id; prefer the newer updatedAt on conflicts.
 * Keeps notes unique by id.
 * @param {Array<any>} existing
 * @param {Array<any>} incoming
 * @returns {Array<any>}
 */
export function mergeNotes(existing, incoming) {
  const map = new Map();
  for (const n of existing) map.set(n.id, n);
  for (const m of incoming) {
    const prev = map.get(m.id);
    if (!prev) {
      map.set(m.id, m);
    } else {
      // Pick the more recent version by updatedAt (fallback: incoming).
      map.set(m.id, (m.updatedAt ?? 0) >= (prev.updatedAt ?? 0) ? m : prev);
    }
  }
  return Array.from(map.values());
}
