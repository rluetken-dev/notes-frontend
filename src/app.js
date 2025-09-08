// app.js
// App glue: state, DOM refs, rendering, events
// -------------------------------------------------
// This file orchestrates the Mini-Notes frontend.
// It wires together modules (theme, storage, time,
// dialogs, utils), manages DOM references, renders
// the notes list, and registers UI event handlers.

/**
 * @typedef {Object} Note
 * @property {string}  id         - Stable unique identifier
 * @property {string}  title      - Note title (plain text)
 * @property {string}  content    - Note body (plain text)
 * @property {number}  createdAt  - Unix ms timestamp when created
 * @property {number}  updatedAt  - Unix ms timestamp when last updated
 * @property {boolean} pinned     - Pinned notes are sorted to the top
 */

import { initThemeController } from './theme.js';
import { loadNotes, saveNotes } from './storage.js';
import { now, timeAgo } from './time.js';
import { confirmDialog } from './dialogs.js';
import { exportNotes, parseImportedFile, mergeNotes } from './backup.js';
import {
  generateId,
  escapeHtml,
  byPinnedThenUpdated,
  matchesQuery,
  extractTags,
  highlightText,
  parseQuery,
} from './utils.js';

// ===== Backend API config =====
// Pick API base automatically:
// - During local dev (served from localhost/127.0.0.1), use the backend port.
// - In any other environment (e.g., deployed behind a reverse proxy), use relative URLs.
const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:5257' // dev backend
  : ''; // prod/same-origin (fetch('/api/notes'))

/**
 * Load notes from the backend API and normalize them to our frontend Note shape.
 * - Never throws: returns an empty array on any error.
 * - Normalizes field names/casing and timestamp formats.
 * - Ensures `id` is a string (our UI expects string IDs).
 */
async function loadNotesFromApi() {
  try {
    // 1) Perform a simple GET request against our notes endpoint.
    const res = await fetch(`${API_BASE}/api/notes`);
    if (!res.ok) {
      // Non-200 response (e.g., 404/500). Log and bail out gracefully.
      console.error('API error:', res.status, await res.text());
      return [];
    }

    // 2) Parse the JSON array returned by the API.
    const raw = await res.json();
    if (!Array.isArray(raw)) {
      console.warn('API returned a non-array payload:', raw);
      return [];
    }

    // Helper: convert many possible timestamp formats to Unix ms.
    const toMs = (v) => {
      if (!v) return undefined;
      // Already a number? Assume ms if reasonably large, else seconds.
      if (typeof v === 'number') {
        return v > 1e12 ? v : v * 1000; // heuristic for s → ms
      }
      // ISO string or anything Date can parse.
      const t = Date.parse(v);
      return Number.isFinite(t) ? t : undefined;
    };

    // 3) Map API items to our Note shape.
    const normalized = raw.map((n) => {
      // Try multiple common field names to be robust.
      const id = n.id ?? n.noteId ?? n.noteID ?? n.guid ?? n.uuid ?? n._id ?? n.key;

      return {
        // Our UI logic expects string IDs for dataset attributes.
        id: String(id ?? crypto.randomUUID()),
        title: n.title ?? n.name ?? '',
        content: n.content ?? n.body ?? '',
        createdAt: toMs(n.createdAt ?? n.created_at ?? n.createdOn ?? n.created_on) ?? Date.now(),
        updatedAt: toMs(n.updatedAt ?? n.updated_at ?? n.modifiedAt ?? n.modified_at) ?? Date.now(),
        // Backend may not know about pinning; default to false.
        pinned: Boolean(n.pinned ?? false),
      };
    });

    return normalized;
  } catch (err) {
    // Network errors, CORS issues, etc. → log and return empty list.
    console.error('Network error while loading notes from API:', err);
    return [];
  }
}

/**
 * Force-refresh notes from the backend API.
 * - Replaces the in-memory list with the API result (even if empty).
 * - Updates the local cache for offline usage.
 * - Renders the UI afterwards.
 * - Shows a tiny "busy" hint by changing the cursor.
 */
async function refreshFromApi() {
  // Visual hint that something is loading (no extra CSS needed).
  const prevCursor = document.body.style.cursor;
  document.body.style.cursor = 'progress';
  showLoading('Refreshing from API…'); // show while hard refresh runs
  try {
    const apiNotes = await loadNotesFromApi();

    // Replace current state with whatever the API returns (array or empty array).
    notes = Array.isArray(apiNotes) ? apiNotes : [];

    // Keep a local cache so a page refresh still shows content offline.
    saveNotes(notes);

    // Re-render UI to reflect the latest server state.
    render();

    console.info(`[Refresh] Loaded ${notes.length} note(s) from API.`);
  } catch (err) {
    console.error('[Refresh] Failed to load from API:', err);
    alert('Refreshing from API failed. Please try again.');
  } finally {
    document.body.style.cursor = prevCursor;
  }
}

/**
 * Create a new note in the backend (HTTP POST).
 * Robust handling:
 * - Accepts 200 or 201.
 * - Works even if the server returns an empty body (no JSON).
 * - On success with empty body, it refreshes the list and tries to find the created note.
 * - Returns a normalized Note object or null on error.
 */
async function createNoteViaApi({ title, content }) {
  try {
    const payload = { title, content };

    const res = await fetch(`${API_BASE}/api/notes`, {
      method: 'POST',
      headers: {
        // Tell the server we send JSON and prefer JSON back.
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // 405 = Method Not Allowed → likely no [HttpPost] in your backend route
    if (res.status === 405) {
      console.error(
        'API POST not allowed (405). Check your backend: is [HttpPost] implemented at /api/notes?'
      );
      return null;
    }

    // Any other non-2xx → log and bail out gracefully
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('API POST error:', res.status, errText);
      return null;
    }

    // Try to parse JSON if present
    const ct = res.headers.get('content-type') || '';
    const rawText = await res.text(); // read body once (may be empty)

    let created = null;
    if (ct.includes('application/json') && rawText.trim().length > 0) {
      try {
        created = JSON.parse(rawText);
      } catch (e) {
        console.warn('POST returned non-JSON body:', rawText);
      }
    } else {
      // No JSON body (common with 201 Created). We'll refresh the list below.
      console.warn('POST succeeded but returned no JSON body. Will refresh from API.');
    }

    // Helper to normalize timestamps to ms
    const toMs = (v) => {
      if (!v) return Date.now();
      if (typeof v === 'number') return v > 1e12 ? v : v * 1000; // sec→ms heuristic
      const t = Date.parse(v);
      return Number.isFinite(t) ? t : Date.now();
    };

    // If we didn't receive the created note, fallback: reload and try to find it
    if (!created) {
      const list = await loadNotesFromApi();
      const match = list.find((x) => x.title === title && x.content === content);
      if (!match) return null; // Couldn’t find it; caller can decide to refresh UI
      return match;
    }

    // Normalize to our frontend Note shape
    const id =
      created.id ??
      created.noteId ??
      created.noteID ??
      created.guid ??
      created.uuid ??
      created._id ??
      created.key;

    return {
      id: String(id ?? crypto.randomUUID()),
      title: created.title ?? title ?? '',
      content: created.content ?? content ?? '',
      createdAt: toMs(
        created.createdAt ?? created.created_at ?? created.createdOn ?? created.created_on
      ),
      updatedAt: toMs(
        created.updatedAt ?? created.updated_at ?? created.modifiedAt ?? created.modified_at
      ),
      pinned: Boolean(created.pinned ?? false),
    };
  } catch (err) {
    console.error('Network error while creating note:', err);
    return null;
  }
}

/**
 * Delete a note in the backend (HTTP DELETE).
 * - Expects the backend route to accept /api/notes/{id}
 * - Returns true on success (204/200), false otherwise.
 * - Does NOT touch UI state; we'll wire the click handler in the next step.
 */
async function deleteNoteViaApi(id) {
  try {
    const res = await fetch(`${API_BASE}/api/notes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json', // harmless if the server returns no body
      },
    });

    // Typical success cases:
    // - 204 No Content
    // - 200 OK (some APIs return the deleted entity)
    if (res.status === 204 || res.status === 200) {
      return true;
    }

    // Not found or other server responses → treat as failure for the caller.
    const errText = await res.text().catch(() => '');
    console.error('API DELETE error:', res.status, errText);
    return false;
  } catch (err) {
    console.error('Network error while deleting note:', err);
    return false;
  }
}

/**
 * Update an existing note in the backend (HTTP PUT).
 * - Endpoint shape: /api/notes/{id}
 * - Payload: only the fields we want to change (title/content/pinned).
 * - Accepts 200 or 204. If no JSON body is returned, we refresh from API and pick the note by id.
 * - Returns a normalized Note object (or null on error).
 */
async function updateNoteViaApi(id, { title, content, pinned }) {
  try {
    // Build minimal payload (omit undefined fields to avoid overwriting on server)
    const payload = {};
    if (typeof title === 'string') payload.title = title;
    if (typeof content === 'string') payload.content = content;
    if (typeof pinned === 'boolean') payload.pinned = pinned;

    const res = await fetch(`${API_BASE}/api/notes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Common server response codes
    if (res.status === 404) {
      console.error('API PUT: note not found (404)');
      return null;
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('API PUT error:', res.status, errText);
      return null;
    }

    // Try to read JSON body if present
    const ct = res.headers.get('content-type') || '';
    const rawText = await res.text(); // may be empty for 204

    let updated = null;
    if (ct.includes('application/json') && rawText.trim().length > 0) {
      try {
        updated = JSON.parse(rawText);
      } catch {
        console.warn('PUT returned non-JSON body:', rawText);
      }
    } else {
      // No body returned → we'll refresh and take the item by id.
      // This keeps our UI consistent without assuming server response shape.
      const list = await loadNotesFromApi();
      const found = list.find((x) => String(x.id) === String(id));
      if (found) return found;
      // If we can't find it, fall through to normalization with `updated = {}`
      updated = {};
    }

    // ---- Normalize to our frontend Note shape (like other helpers) ----
    const toMs = (v) => {
      if (!v) return Date.now();
      if (typeof v === 'number') return v > 1e12 ? v : v * 1000; // sec→ms heuristic
      const t = Date.parse(v);
      return Number.isFinite(t) ? t : Date.now();
    };

    const normId =
      updated.id ??
      updated.noteId ??
      updated.noteID ??
      updated.guid ??
      updated.uuid ??
      updated._id ??
      updated.key ??
      id;

    return {
      id: String(normId),
      title: updated.title ?? title ?? '',
      content: updated.content ?? content ?? '',
      createdAt: toMs(
        updated.createdAt ?? updated.created_at ?? updated.createdOn ?? updated.created_on
      ),
      updatedAt: toMs(
        updated.updatedAt ?? updated.updated_at ?? updated.modifiedAt ?? updated.modified_at
      ),
      pinned: Boolean(updated.pinned ?? pinned ?? false),
    };
  } catch (err) {
    console.error('Network error while updating note:', err);
    return null;
  }
}

// ---- State ----
// In-memory state of all notes; persisted via localStorage.
let notes = loadNotes();
/** @type {Note['id'] | null} */
let editingId = null; // id of the note currently being edited (null = none)

// ---- DOM ----
// Cache hot DOM nodes used throughout the file to avoid repeated lookups.
const form = document.getElementById('note-form');
const titleEl = document.getElementById('title');
const contentEl = document.getElementById('content');
const listEl = document.getElementById('notes');
const searchEl = document.getElementById('search');

const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const editTitle = document.getElementById('edit-title');
const editContent = document.getElementById('edit-content');
const editCancel = document.getElementById('edit-cancel');
// Use optional chaining in case the element is missing during early load.
const editBackdrop = editModal?.querySelector('.modal-backdrop');

const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importInput = document.getElementById('import-input');

// ===== API online state (centralized) =====
// We keep a flag and a single function that enforces read-only UI when offline.
let apiOnline = true;

/**
 * Apply current API state to interactive controls.
 * - Disables "Add" button and all item actions when offline.
 * - Call this after any re-render to keep buttons in sync.
 */
function applyApiOnlineState() {
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = !apiOnline;
    submitBtn.title = apiOnline ? 'Add note' : 'API offline – cannot create notes';
  }
  listEl.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.disabled = !apiOnline;
    btn.title = apiOnline ? '' : 'API offline – action disabled';
  });
}

// ===== UI: Refresh button (no HTML change) =====
// Create a "Refresh" button next to the Export button. Clicking it forces a reload from API.
const refreshBtn = document.createElement('button');
refreshBtn.id = 'refresh-btn';
refreshBtn.type = 'button';
refreshBtn.textContent = 'Refresh';
refreshBtn.title = 'Force reload from API (Ctrl/Cmd+Shift+R)';
refreshBtn.addEventListener('click', async () => {
  // Prevent double clicks while the request is running
  refreshBtn.disabled = true;
  const prevText = refreshBtn.textContent;
  refreshBtn.textContent = 'Refreshing…';
  try {
    await refreshFromApi(); // uses the helper we added earlier
  } finally {
    refreshBtn.textContent = prevText;
    refreshBtn.disabled = false;
  }
});

// ===== API status indicator (tiny online/offline dot) =====
// Creates a small "API: Online/Offline" indicator and updates it periodically.

const apiStatus = document.createElement('span');
apiStatus.id = 'api-status';
apiStatus.style.marginLeft = '8px';
apiStatus.style.fontSize = '0.875rem';
apiStatus.style.opacity = '0.8';
apiStatus.textContent = 'API: …';

/*
// Try to place it next to the Refresh button; otherwise add to body.
if (typeof refreshBtn !== 'undefined' && refreshBtn.parentElement) {
  refreshBtn.parentElement.insertBefore(apiStatus, refreshBtn.nextSibling);
} else {
  document.body.appendChild(apiStatus);
}
*/

// Put the status at the far right so it never squeezes the buttons.
// English: margin-left:auto makes this flex item absorb remaining space.
apiStatus.style.marginLeft = 'auto';
if (importBtn?.parentElement) {
  importBtn.parentElement.insertBefore(apiStatus, importBtn.nextSibling); // after Import
} else {
  headerBar.appendChild(apiStatus); // fallback: last item in the row
}

// ===== UI polish: toolbar layout + status badge =====
// Make the container a flex row so buttons + status sit nicely in one line.
const headerBar = exportBtn?.parentElement || document.body;
headerBar.style.display = 'flex';
//headerBar.style.flexWrap = 'wrap';
headerBar.style.flexWrap = 'nowrap'; // Keep everything on one line; we'll push the status to the far right
headerBar.style.alignItems = 'center';
headerBar.style.gap = '8px';

// Inject a few CSS rules for a neat badge look.
const style = document.createElement('style');
style.textContent = `
  /* Compact pill badge with a live dot */
  #api-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    font-size: 0.9rem;
    padding: 2px 10px;
    border-radius: 999px;
    background: rgba(255,255,255,0.06); /* subtle pill on dark UI */
  }
  #api-status::before {
    content: "";
    width: 8px; height: 8px;
    border-radius: 50%;
    background: currentColor; /* uses the text color */
    box-shadow: 0 0 0 2px rgba(0,0,0,0.2);
  }
  /* Colors controlled via data-state attribute */
  #api-status[data-state="online"]  { color: #22c55e; } /* green-500 */
  #api-status[data-state="offline"] { color: #dc2626; } /* red-600 */

  /* Slight spacing tweak for the refresh button */
  #refresh-btn { margin-left: 4px; }
`;

// Extra UI polish for note cards & actions (scoped to #notes)
/* English comments included for clarity */
const noteUiStyle = document.createElement('style');
noteUiStyle.textContent = `
  /* Layout: notes list as a tidy grid */
  #notes { display: grid; gap: 14px; }

  /* Card look for each note */
  #notes .note {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 14px 16px;
    transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
  }
  /* Subtle hover lift */
  #notes .note:not(.empty):hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.15);
    border-color: rgba(255,255,255,0.14);
  }

  /* Pinned accent */
  #notes .note.pinned {
    border-left: 4px solid #f59e0b; /* amber-500 */
    padding-left: 12px;             /* compensate for the accent */
  }

  /* Empty states look softer */
  #notes .note.empty {
    text-align: center;
    color: rgba(255,255,255,0.8);
    background: rgba(255,255,255,0.03);
    border-style: dashed;
  }

  /* Tags line */
  #notes .tags { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 6px; padding:0; list-style:none; }
  #notes .tag {
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(255,255,255,0.08);
    font-size: .8rem;
    line-height: 1.3;
  }
  #notes .tag.match { outline: 2px solid rgba(34,197,94,.6); } /* green highlight when matched */

  /* Actions row */
  #notes .actions { display:flex; gap:8px; margin-top: 10px; }

  /* Buttons inside cards */
  #notes .actions button {
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.06);
    font-weight: 600;
    transition: background 120ms ease, border-color 120ms ease, transform 80ms ease;
  }
  #notes .actions button:hover { background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.20); }
  #notes .actions button:active { transform: translateY(1px); }

  /* Disabled state (offline read-only) */
  #notes .actions button:disabled {
    opacity: .55;
    cursor: not-allowed;
    filter: grayscale(25%);
  }

  /* Timestamp style a tad softer */
  #notes .note .ts { display:block; margin-top:8px; opacity:.8; }
`;

// Stronger card look + colored action buttons (scoped via .ui-polish)
const strongStyle = document.createElement('style');
strongStyle.textContent = `
  /* Turn on the look only when body has .ui-polish */
  .ui-polish #notes .note {
    background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)) !important;
    border: 1px solid rgba(255,255,255,0.16) !important;
    border-radius: 16px !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25) !important;
  }
  .ui-polish #notes .note h3 {
    font-size: 1.1rem;
    margin: 0 0 6px;
    font-weight: 700;
  }

  /* More obvious pinned accent */
  .ui-polish #notes .note.pinned {
    border-left: 5px solid #f59e0b !important; /* amber */
    padding-left: 12px;
  }

  /* Colored action buttons by intent */
  .ui-polish #notes .actions button[data-action="edit"] {
    background: #2563eb !important;  /* blue-600 */
    color: #fff !important;
    border-color: transparent !important;
  }
  .ui-polish #notes .actions button[data-action="delete"] {
    background: #dc2626 !important;  /* red-600 */
    color: #fff !important;
    border-color: transparent !important;
  }
  .ui-polish #notes .actions button[data-action="toggle-pin"] {
    background: #f59e0b !important;  /* amber-500 */
    color: #111 !important;
    border-color: transparent !important;
  }

  /* Hover/active polish */
  .ui-polish #notes .actions button:hover {
    filter: brightness(1.05);
  }
  .ui-polish #notes .actions button:active {
    transform: translateY(1px);
  }

  /* Disabled look stays clear */
  .ui-polish #notes .actions button:disabled {
    opacity: .6 !important;
    filter: saturate(.3) !important;
    cursor: not-allowed !important;
  }
`;

document.head.appendChild(strongStyle);

// Enable the polished look
document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('ui-polish');
});

// Disable the strong "ui-polish" look and go back to the subtle default.
// English: we remove the class so the strongStyle rules (scoped to .ui-polish) no longer apply.
document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.remove('ui-polish');
});

/**
 * Ping the API with a lightweight GET to decide if it's reachable.
 * Returns true on HTTP 200, false otherwise.
 */
async function pingApi() {
  try {
    // Use notes endpoint since it's already CORS-enabled and cheap.
    const res = await fetch(`${API_BASE}/api/notes`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Start periodic updates of the indicator (every 30s).
 * Also runs once immediately on start.
 */
function startApiHealthIndicator() {
  const setState = (ok) => {
    apiOnline = ok; // keep a single source of truth

    // Update label + color
    //apiStatus.textContent = ok ? 'API: Online' : 'API: Offline (read-only)';
    apiStatus.style.color = ok ? 'green' : 'crimson';

    // Shorter label; full info via tooltip
    apiStatus.textContent = ok ? 'API: Online' : 'API: Offline';
    apiStatus.title = ok ? 'Backend reachable' : 'Read-only: backend not reachable';
    apiStatus.dataset.state = ok ? 'online' : 'offline'; // keeps your badge colors working

    // Enforce UI state for all controls (newly rendered ones included)
    applyApiOnlineState();
  };

  // First check immediately
  pingApi().then(setState);

  // Then every 30 seconds
  setInterval(async () => {
    const ok = await pingApi();
    setState(ok);
  }, 30_000);
}

// ----- place controls in the DOM (order matters) -----
// 1) Put the Refresh button next to the Export button (or at page top as fallback)
if (exportBtn?.parentElement) {
  exportBtn.parentElement.insertBefore(refreshBtn, exportBtn.nextSibling);
} else {
  document.body.insertBefore(refreshBtn, document.body.firstChild);
}

// 2) Now that refreshBtn is in the DOM, place the status right after it
// (no need to check parentElement anymore)

refreshBtn.parentElement.insertBefore(apiStatus, refreshBtn.nextSibling);
// Start the indicator when the DOM is ready
document.addEventListener('DOMContentLoaded', startApiHealthIndicator);

// ---- Theme init ----
// Initialize theme controller as soon as DOM is ready (toggle, system sync).
document.addEventListener('DOMContentLoaded', initThemeController);

// ---- Rendering ----

// ===== Tiny loading helper =====
// Shows a simple "Loading..." placeholder inside the notes list.
// Must be placed after DOM refs, because it uses `listEl`.
function showLoading(message = 'Loading…') {
  listEl.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'note empty';
  li.innerHTML = `<p>${message}</p>`;
  listEl.appendChild(li);
}

/**
 * Update all relative time (<small.ts>) labels in the notes list.
 * Call this periodically (e.g., every minute) or when the tab becomes visible.
 */
function refreshTimes() {
  listEl.querySelectorAll('.ts').forEach((el) => {
    const ts = Number(el.dataset.ts);
    if (!Number.isFinite(ts)) return; // guard against missing/invalid timestamps
    el.textContent = `Zuletzt geändert: ${timeAgo(ts)}`;
    el.setAttribute('title', new Date(ts).toLocaleString());
  });
}

/**
 * Render the notes list based on current state and search query.
 * Handles empty states (no notes / no matches) and injects action buttons.
 */
function render() {
  // Read current search query; empty string means "match all".
  const q = searchEl?.value.trim() || '';
  const { tags: queryTags } = parseQuery(q); // NEW
  listEl.innerHTML = '';

  // Clear existing list items before re-hydrating the view.
  listEl.innerHTML = '';

  // Enable/disable Export based on total note count (must run before early returns)
  if (exportBtn) {
    const hasNotes = notes.length > 0;
    exportBtn.disabled = !hasNotes;
    exportBtn.setAttribute('aria-disabled', String(!hasNotes));
    exportBtn.title = hasNotes ? 'Export notes as JSON' : 'Nothing to export yet';
  }

  // Empty-state #1: There are no notes at all yet.
  if (notes.length === 0) {
    const li = document.createElement('li');
    li.className = 'note empty';
    li.innerHTML = `<p>Noch keine Notizen. Lege oben deine erste Notiz an.</p>`;
    listEl.appendChild(li);
    applyApiOnlineState();
    return;
  }

  const filtered = notes
    .slice()
    .sort(byPinnedThenUpdated)
    .filter((n) => matchesQuery(n, q));

  // Empty-state #2: Notes exist, but none match the current search query.
  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'note empty';
    li.innerHTML = `<p>Keine Treffer für „${escapeHtml(q)}“.</p>`;
    listEl.appendChild(li);
    applyApiOnlineState();
    return;
  }

  // Normal rendering: build one <li> per note.
  filtered.forEach((n) => {
    const li = document.createElement('li');
    li.className = 'note' + (n.pinned ? ' pinned' : '');

    const ts = n.updatedAt || n.createdAt || now();

    // Compute tags from title + content for display
    const tags = extractTags(n.title, n.content);

    li.innerHTML = `
  <h3>${n.pinned ? '📌 ' : ''}${highlightText(n.title, q)}</h3>
  <p>${highlightText(n.content, q)}</p>
  ${
    tags.length
      ? `
    <ul class="tags" aria-label="Tags">
      ${tags
        .map((t) => {
          const isMatch = queryTags.includes(t);
          // Add a CSS class when the tag is part of the current query
          return `<li class="tag${isMatch ? ' match' : ''}">#${escapeHtml(t)}</li>`;
        })
        .join('')}
    </ul>
  `
      : ''
  }
  <small class="ts" data-ts="${ts}" title="${new Date(ts).toLocaleString()}">
    Zuletzt geändert: ${timeAgo(ts)}
  </small>
  <div class="actions">
    <button data-action="toggle-pin" data-id="${n.id}">${n.pinned ? 'Unpin' : 'Pin'}</button>
    <button data-action="edit" data-id="${n.id}">Edit</button>
    <button data-action="delete" data-id="${n.id}">Delete</button>
  </div>
`;

    listEl.appendChild(li);
  });
  applyApiOnlineState();
}

// ---- Events ----

// Create a new note from the top form (POST /api/notes)
// - Validates inputs
// - Sends to backend
// - On success: prepend to list, cache, re-render
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Guard: when API is offline we bail out (button should be disabled anyway)
  if (!apiOnline) return;

  const title = titleEl.value.trim();
  const content = contentEl.value.trim();
  if (!title || !content) return; // simple required-fields check

  // Prevent double submits
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn?.setAttribute('disabled', '');

  try {
    const created = await createNoteViaApi({ title, content });
    if (!created) {
      alert('Creating the note via API failed. Please try again.');
      return;
    }

    // Prepend new note so it appears at the top
    notes.unshift(created);
    saveNotes(notes);
    form.reset();
    render();
  } catch (err) {
    console.error('Create submit failed:', err);
    alert('Unexpected error while creating the note.');
  } finally {
    submitBtn?.removeAttribute('disabled');
  }
});

/**
 * Update note via API on edit-form submit.
 * - Sends the edits to the backend (PUT /api/notes/{id})
 * - On success: replace the local note with the server-authoritative version,
 *   cache to localStorage, close the modal, and re-render.
 * - On failure: keep the modal open and show a simple alert.
 */
editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editingId) return;

  // Find the note being edited in our in-memory list.
  const idx = notes.findIndex((n) => String(n.id) === String(editingId));
  if (idx < 0) return;

  // Gather trimmed values from the modal inputs.
  const newTitle = editTitle.value.trim();
  const newContent = editContent.value.trim();
  if (!newTitle || !newContent) return; // simple required-fields check

  // Disable the submit button to prevent duplicate submissions.
  const submitBtn = editForm.querySelector('button[type="submit"]');
  submitBtn?.setAttribute('disabled', '');

  try {
    // Send update to the backend first
    const updated = await updateNoteViaApi(editingId, {
      title: newTitle,
      content: newContent,
    });

    if (!updated) {
      // Server refused or network error → keep the modal open
      alert('Updating the note via API failed. Please try again.');
      return;
    }

    // Replace local copy with the server-authoritative version
    notes[idx] = { ...notes[idx], ...updated };

    // Persist a local cache (useful for offline refresh)
    saveNotes(notes);

    // Close modal and refresh UI
    editingId = null;
    editModal.hidden = true;
    document.body.classList.remove('no-scroll');
    render();
  } catch (err) {
    console.error('Edit submit failed:', err);
    alert('Unexpected error while updating the note.');
  } finally {
    // Re-enable the submit button regardless of outcome
    submitBtn?.removeAttribute('disabled');
  }
});

/**
 * Global keyboard shortcut: Ctrl/Cmd + Enter submits the new-note form.
 * Useful when the content textarea is focused.
 */
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    form.requestSubmit();
  }
});

/**
 * Event delegation for note actions (Pin / Edit / Delete).
 * We attach one listener on the list container and react to button clicks.
 */
listEl.addEventListener('click', async (e) => {
  // Find the nearest action button that was clicked.
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const id = btn.dataset.id; // target note id
  const action = btn.dataset.action; // 'toggle-pin' | 'edit' | 'delete'

  if (action === 'delete') {
    // Ask for user confirmation via modal.
    const ok = await confirmDialog({
      title: 'Delete note',
      text: 'Do you really want to delete this note? This cannot be undone.',
    });
    if (!ok) return;

    // Disable the clicked button to prevent double submissions.
    btn.setAttribute('disabled', '');

    try {
      // 1) Delete on the backend first
      const success = await deleteNoteViaApi(id);
      if (!success) {
        alert('Deleting the note via API failed. The item was not removed.');
        return;
      }

      // 2) If the server deletion succeeded, update local state + cache
      notes = notes.filter((n) => n.id !== id);
      saveNotes(notes);

      // 3) Re-render the list
      render();
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Unexpected error while deleting the note.');
    } finally {
      // Re-enable the button no matter what
      btn.removeAttribute('disabled');
    }
  } else if (action === 'edit') {
    // Open the edit modal pre-filled with the note data.
    const n = notes.find((n) => n.id === id);
    if (!n) return;

    editingId = id;
    editTitle.value = n.title;
    editContent.value = n.content;

    editModal.hidden = false;
    document.body.classList.add('no-scroll'); // prevent background scroll

    // Defer focus to ensure the modal is visible first.
    setTimeout(() => editTitle.focus(), 0);
  } else if (action === 'toggle-pin') {
    // Toggle "pinned" via API first, then update local state on success.
    const i = notes.findIndex((n) => String(n.id) === String(id));
    if (i < 0) return;

    // Disable the clicked button to avoid rapid double-clicks.
    btn.setAttribute('disabled', '');

    try {
      const current = notes[i];
      const newPinned = !current.pinned;

      // Some backends require a "full" update for PUT.
      // We therefore send title + content unchanged AND the new pinned flag.
      const payload = {
        title: current.title,
        content: current.content,
        pinned: newPinned,
      };

      // (Optional) Debug to verify what's sent:
      // console.log('[UI] toggle pin payload →', id, payload);

      const updated = await updateNoteViaApi(id, payload);

      if (!updated) {
        alert('Toggling pin via API failed. Please try again.');
        return;
      }

      // Merge server-authoritative result; ensure pinned reflects our intent
      notes[i] = {
        ...current,
        ...updated,
        pinned: typeof updated.pinned === 'boolean' ? updated.pinned : newPinned,
      };

      saveNotes(notes);
      render();
    } catch (err) {
      console.error('Pin toggle failed:', err);
      alert('Unexpected error while toggling pin.');
    } finally {
      btn.removeAttribute('disabled');
    }
  }
});

/**
 * Close the edit modal without saving (Cancel button).
 */
editCancel.addEventListener('click', () => {
  editingId = null;
  editModal.hidden = true;
  document.body.classList.remove('no-scroll');
});

/**
 * Close the edit modal when clicking on the backdrop.
 */
editBackdrop?.addEventListener('click', () => {
  editingId = null;
  editModal.hidden = true;
  document.body.classList.remove('no-scroll');
});

/**
 * Close the edit modal on ESC key (only if modal is currently open).
 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !editModal.hidden) {
    editingId = null;
    editModal.hidden = true;
    document.body.classList.remove('no-scroll');
  }
});

/**
 * When the tab becomes visible again, refresh relative timestamps
 * so "Zuletzt geändert: …" stays accurate without a full re-render.
 */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshTimes();
});

/**
 * Live-search: re-render notes on every input change.
 * NOTE: Debounce could be added for extremely large lists,
 * but it's not necessary at this scale.
 */
searchEl.addEventListener('input', render);

// Export current notes as JSON
exportBtn?.addEventListener('click', () => {
  // NOTE: Uses a minimal schema check; invalid items are dropped.
  exportNotes(notes);
});

// Open file picker for import
importBtn?.addEventListener('click', () => {
  importInput?.click();
});

// Handle selected .json, ask user: replace all or merge, then persist & re-render
importInput?.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  if (!file) return;

  const { notes: incoming, error } = await parseImportedFile(file);
  importInput.value = ''; // reset the file input for subsequent imports

  if (error) {
    alert(error); // simple feedback; could be a nicer toast/modal later
    return;
  }

  // Ask the user whether to REPLACE everything or MERGE
  const replace = await confirmDialog({
    title: 'Import notes',
    text: `Found ${incoming.length} note(s) in the file.\n\nOK = Replace all existing notes\nCancel = Merge with existing notes`,
  });

  notes = replace ? incoming : mergeNotes(notes, incoming);

  saveNotes(notes);
  render();
});

/**
 * Keyboard shortcut: Ctrl/Cmd + Shift + R → force refresh from API.
 * We pick this combo to avoid clashing with the browser's normal Reload.
 */
document.addEventListener('keydown', async (e) => {
  const isCtrlOrCmd = e.ctrlKey || e.metaKey;
  if (isCtrlOrCmd && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
    e.preventDefault(); // prevent browser default if any
    await refreshFromApi();
  }
});

// ---- Init ----
/**
 * Hydrate notes on startup:
 * - Try to load from the backend API.
 * - If API returns items, use them and cache to localStorage (offline-friendly).
 * - If API fails or is empty, keep whatever we already loaded from localStorage.
 * - Always render at the end so the UI shows something quickly.
 */
async function hydrateNotes() {
  try {
    showLoading('Loading from API…'); // visual hint while first load runs
    const apiNotes = await loadNotesFromApi();

    // If the API has data, prefer it over local cache.
    if (Array.isArray(apiNotes) && apiNotes.length > 0) {
      notes = apiNotes;

      // Optional: keep a local cache so a page refresh still shows content offline.
      saveNotes(notes);
    } else {
      // API returned empty array → keep local notes (already loaded above).
      // This avoids wiping user content if the backend DB happens to be empty.
      console.info('API empty; using localStorage notes.');
    }
  } catch (e) {
    // Network/CORS/parse issues → fail gracefully and keep local notes.
    console.warn('API unavailable; falling back to localStorage. Reason:', e);
  } finally {
    // Render either API-backed notes or the local fallback.
    render();

    // Keep timestamps fresh without re-rendering the whole list.
    setInterval(refreshTimes, 60_000); // refresh every 60 seconds
  }
}

// Run hydration once the DOM is ready.
// (initThemeController is wired separately above; that's fine.)
document.addEventListener('DOMContentLoaded', hydrateNotes);
