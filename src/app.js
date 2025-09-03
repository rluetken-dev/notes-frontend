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

// ---- Theme init ----
// Initialize theme controller as soon as DOM is ready (toggle, system sync).
document.addEventListener('DOMContentLoaded', initThemeController);

// ---- Rendering ----

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
}

// ---- Events ----

/**
 * Create a new note from the top form.
 * - Prevents default form navigation.
 * - Validates non-empty title/content.
 * - Persists and re-renders the list.
 */
form.addEventListener('submit', (e) => {
  e.preventDefault();

  const title = titleEl.value.trim();
  const content = contentEl.value.trim();
  if (!title || !content) return; // simple required-fields check

  /** @type {Note} */
  const newNote = {
    id: generateId(),
    title,
    content,
    createdAt: now(),
    updatedAt: now(),
    pinned: false,
  };

  // Prepend new note so it appears at the top (with current sorting).
  notes.unshift(newNote);

  saveNotes(notes);
  form.reset();
  render();
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
    const ok = await confirmDialog({});
    if (!ok) return;

    // Remove and persist.
    notes = notes.filter((n) => n.id !== id);
    saveNotes(notes);
    render();
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
    // Flip the pinned flag and bump updatedAt for meaningful sorting.
    const i = notes.findIndex((n) => n.id === id);
    if (i < 0) return;

    notes[i].pinned = !notes[i].pinned;
    notes[i].updatedAt = now();

    saveNotes(notes);
    render();
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
 * Save changes from the edit modal.
 * - Validates that a note is being edited.
 * - Merges new values, updates timestamp, persists, re-renders.
 */
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

  saveNotes(notes);
  editingId = null;
  editModal.hidden = true;
  document.body.classList.remove('no-scroll');
  render();
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

  const { notes: incoming, meta, error } = await parseImportedFile(file);
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

// ---- Init ----
// Initial render of the list and periodic refresh of time labels.
render();
setInterval(refreshTimes, 60_000); // refresh every 60 seconds
// NOTE: You can clear this interval on page unload if desired.
