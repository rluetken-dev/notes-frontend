// ==================================================
// Mini Notes App
// ==================================================

// ==================================================
// Theme controller (light/dark with persistence)
// ==================================================

// NOTE: CSS must define variables and selectors as you already did:
// - @media (prefers-color-scheme: dark) { :root { ...dark tokens... } }
// - html[data-theme="light"] { ...light tokens... }
// - html[data-theme="dark"]  { ...dark tokens... }

const THEME_KEY = 'mini-notes.theme'; // stores explicit user choice: 'light' | 'dark'; null = system

/** Load user's explicit theme choice or null if not set (system fallback). */
function loadThemeChoice() {
  return localStorage.getItem(THEME_KEY) ?? null;
}

/** Persist user's explicit theme choice ('light' | 'dark'); pass null to reset to system. */
function saveThemeChoice(choice) {
  if (choice === null) {
    localStorage.removeItem(THEME_KEY);
  } else {
    localStorage.setItem(THEME_KEY, choice);
  }
}

/** Apply theme to <html>: if null → remove override to let @media decide. */
function applyTheme(choice) {
  const html = document.documentElement;
  if (choice === null) {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', choice);
  }
}

/** Compute currently effective theme (used for labeling/UI only). */
function getEffectiveTheme() {
  const choice = loadThemeChoice();
  if (choice === 'light' || choice === 'dark') return choice;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

/** Update toggle button tooltip/state for better UX and accessibility. */
function updateToggleUI() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const choice = loadThemeChoice(); // 'light' | 'dark' | null
  const effective = getEffectiveTheme(); // 'light' | 'dark'
  const isSystem = choice === null;

  btn.textContent = '🌓'; // keep icon only; you can swap to text if preferred
  btn.title = `Theme: ${isSystem ? `${effective} (system)` : effective} — click to toggle`;
  btn.setAttribute('aria-pressed', effective === 'dark' ? 'true' : 'false');
}

/** Toggle theme: flip effective theme and persist explicit choice. */
function toggleTheme() {
  const effective = getEffectiveTheme();
  const next = effective === 'dark' ? 'light' : 'dark';
  saveThemeChoice(next);
  applyTheme(next);
  updateToggleUI();
}

/** Optional helper: reset back to system preference. */
function resetToSystemTheme() {
  saveThemeChoice(null);
  applyTheme(null);
  updateToggleUI();
}

/** Initialize theme behavior on load. */
function initThemeController() {
  // Apply any stored explicit choice; null → system.
  applyTheme(loadThemeChoice());

  // Listen to system theme changes only if user hasn't chosen explicitly.
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (mq?.addEventListener) {
    mq.addEventListener('change', () => {
      if (loadThemeChoice() === null) {
        applyTheme(null);
        updateToggleUI();
      }
    });
  }

  // Wire up the toggle button.
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', toggleTheme);
    // Right-click to reset to system preference (nice power-user gesture).
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      resetToSystemTheme();
    });
  }

  updateToggleUI();
}

// Kick off the theme controller early (after DOM ready).
document.addEventListener('DOMContentLoaded', initThemeController);

// ==================================================
// Storage + State
// ==================================================

/** Key used to persist notes in localStorage. */
const STORAGE_KEY = 'mini-notes.v1';

/** Load notes array from localStorage; return [] on parse errors or empty store. */
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

/** Save notes array to localStorage (stringified JSON). */
function save(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

/** Global state holding the list of notes. */
let notes = load();

// ==================================================
// DOM References
// ==================================================

/** Cache frequently used DOM nodes for performance and clarity. */
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

const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmText = document.getElementById('confirm-text');
const confirmOk = document.getElementById('confirm-ok');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmBackdrop = confirmModal?.querySelector('.modal-backdrop');
const editBackdrop = editModal?.querySelector('.modal-backdrop');

/** Holds the ID of the note being edited; null when no edit is active. */
let editingId = null;

// ==================================================
// Helpers
// ==================================================

/** Timestamp helper (ms since epoch). */
const now = () => Date.now();

/** Generate a reasonably unique ID; prefer crypto.randomUUID when available. */
const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Relative time formatter (German), provides "vor X Minuten/Stunden/..." labels. */
const rtf = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });

/** Convert a timestamp to a human-friendly "time ago" string (German). */
function timeAgo(ts) {
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

/** Refresh all relative timestamps (e.g., once per minute or on visibilitychange). */
function refreshTimes() {
  listEl.querySelectorAll('.ts').forEach((el) => {
    const ts = Number(el.dataset.ts);
    if (!Number.isFinite(ts)) return;
    el.textContent = `Zuletzt geändert: ${timeAgo(ts)}`;
    el.setAttribute('title', new Date(ts).toLocaleString());
  });
}

/** Sort: pinned notes first, then by updatedAt descending (newest first). */
const byPinnedThenUpdated = (a, b) => {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
};

/** Case-insensitive text filter (title/content); empty query matches all. */
const matchesQuery = (n, q) => {
  if (!q) return true;
  q = q.toLowerCase();
  return (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
};

/** Escape HTML to avoid XSS when injecting note content as innerHTML. */
function escapeHtml(s) {
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
 * Tiny confirm dialog backed by a modal.
 * Returns a Promise<boolean> resolving to true when user confirms.
 */
function confirmDialog({
  title = 'Notiz löschen?',
  text = 'Diese Aktion kann nicht rückgängig gemacht werden.',
} = {}) {
  return new Promise((resolve) => {
    // Inject content
    confirmTitle.textContent = title;
    confirmText.textContent = text;

    // Show modal & lock scroll
    confirmModal.hidden = false;
    document.body.classList.add('no-scroll');

    // Handlers
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBack = () => cleanup(false);
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') cleanup(true);
    };

    function cleanup(result) {
      confirmOk.removeEventListener('click', onOk);
      confirmCancel.removeEventListener('click', onCancel);
      confirmBackdrop?.removeEventListener('click', onBack);
      document.removeEventListener('keydown', onKey);
      confirmModal.hidden = true;
      document.body.classList.remove('no-scroll');
      resolve(result);
    }

    // Wire once
    confirmOk.addEventListener('click', onOk, { once: true });
    confirmCancel.addEventListener('click', onCancel, { once: true });
    confirmBackdrop?.addEventListener('click', onBack, { once: true });
    document.addEventListener('keydown', onKey);

    // Focus primary action for quick Enter confirm
    setTimeout(() => confirmOk.focus(), 0);
  });
}

// ==================================================
// Rendering
// ==================================================

/** Re-render the notes list based on state and current search query. */
function render() {
  const q = searchEl?.value.trim() || '';
  listEl.innerHTML = '';

  const filtered = notes
    .slice() // do not mutate original order
    .sort(byPinnedThenUpdated)
    .filter((n) => matchesQuery(n, q));

  // Empty states
  if (notes.length === 0) {
    const li = document.createElement('li');
    li.className = 'note empty';
    li.innerHTML = `<p>Noch keine Notizen. Lege oben deine erste Notiz an.</p>`;
    listEl.appendChild(li);
    return;
  }

  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'note empty';
    li.innerHTML = `<p>Keine Treffer für „${escapeHtml(q)}“.</p>`;
    listEl.appendChild(li);
    return;
  }

  // Normal rendering
  filtered.forEach((n) => {
    const li = document.createElement('li');
    li.className = 'note' + (n.pinned ? ' pinned' : '');
    const ts = n.updatedAt || n.createdAt || now();

    // NOTE: innerHTML is safe here because we sanitize user content via escapeHtml.
    li.innerHTML = `
      <h3>${n.pinned ? '📌 ' : ''}${escapeHtml(n.title)}</h3>
      <p>${escapeHtml(n.content)}</p>
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
}

// ==================================================
// Event Listeners
// ==================================================

/** Handle new note creation via the top form. */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = titleEl.value.trim();
  const content = contentEl.value.trim();
  if (!title || !content) return;

  notes.unshift({
    id: generateId(),
    title,
    content,
    createdAt: now(),
    updatedAt: now(),
    pinned: false,
  });

  save(notes);
  form.reset();
  render();
});

/** Convenience shortcut: Ctrl/Cmd + Enter submits the note form. */
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    form.requestSubmit();
  }
});

/** Delegate clicks for Pin/Edit/Delete actions within the notes list. */
listEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === 'delete') {
    const ok = await confirmDialog({
      title: 'Notiz löschen?',
      text: 'Diese Aktion kann nicht rückgängig gemacht werden.',
    });
    if (!ok) return;
    notes = notes.filter((n) => n.id !== id);
    save(notes);
    render();
  } else if (action === 'edit') {
    const n = notes.find((n) => n.id === id);
    if (!n) return;
    editingId = id;
    editTitle.value = n.title;
    editContent.value = n.content;
    editModal.hidden = false;
    document.body.classList.add('no-scroll');
    setTimeout(() => editTitle.focus(), 0); // focus for better UX
  } else if (action === 'toggle-pin') {
    const i = notes.findIndex((n) => n.id === id);
    if (i < 0) return;
    notes[i].pinned = !notes[i].pinned;
    notes[i].updatedAt = now(); // keeps sorting meaningful
    save(notes);
    render();
  }
});

/** Close the edit modal without saving. */
editCancel.addEventListener('click', () => {
  editingId = null;
  editModal.hidden = true;
  document.body.classList.remove('no-scroll');
});

/** Click on edit modal backdrop closes it. */
editBackdrop?.addEventListener('click', () => {
  editingId = null;
  editModal.hidden = true;
  document.body.classList.remove('no-scroll');
});

/** ESC closes the edit modal if open. */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !editModal.hidden) {
    editingId = null;
    editModal.hidden = true;
    document.body.classList.remove('no-scroll');
  }
});

/** Save edits made in the edit modal. */
editForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!editingId) return;

  const i = notes.findIndex((n) => n.id === editingId);
  if (i < 0) return;

  notes[i] = {
    ...notes[i],
    title: editTitle.value.trim(),
    content: editContent.value.trim(),
    updatedAt: now(),
  };

  save(notes);
  editingId = null;
  editModal.hidden = true;
  document.body.classList.remove('no-scroll');
  render();
});

/** When tab becomes visible again, refresh relative times to stay accurate. */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshTimes();
});

/** Live-search: re-render on every input change. */
searchEl.addEventListener('input', render);

// ==================================================
// Init
// ==================================================

/** Initial render and periodic relative-time refresh. */
render();
setInterval(refreshTimes, 60_000); // refresh timestamps every 60 seconds
