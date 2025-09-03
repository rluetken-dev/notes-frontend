// storage.js
// Small persistence helpers for notes
// -------------------------------------------------
// Handles reading/writing the notes array to localStorage using a single key.
// Keeps the module tiny and framework-agnostic. All schema/migration logic
// (if any) should be handled by callers before/after using these functions.

/**
 * Storage key for this app's data.
 * - The suffix ".v1" acts as a simple schema/version indicator.
 * - If you ever change the stored structure, bump this to ".v2" and
 *   implement a small migration in the loader that reads old data and rewrites.
 */
const STORAGE_KEY = 'mini-notes.v1';

/**
 * Load notes array from localStorage.
 *
 * Implementation details:
 * - Safely parses JSON and falls back to an empty array on any error (corruption,
 *   manual edits, or first run where nothing is stored yet).
 * - Returns a plain array; no validation is performed here to stay lightweight.
 *   If you need to enforce a schema, validate in the caller.
 *
 * @returns {Array<any>}  Notes array as stored (caller can cast/validate to a stricter type)
 */
export function loadNotes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    // If JSON is malformed or storage is unavailable, start with a clean slate.
    return [];
  }
}

/**
 * Save notes array to localStorage.
 *
 * Notes:
 * - Uses JSON.stringify; objects should be serializable (no functions, cyclic refs).
 * - This call is synchronous and can throw (e.g., QuotaExceededError) if storage is full.
 *   We deliberately do NOT catch here so the caller can handle/report failures as needed.
 *   If you prefer silent failure, wrap this in a try/catch at the call site.
 *
 * @param {Array<any>} notes  Notes array to persist
 * @returns {void}
 */
export function saveNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}
