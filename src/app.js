// app.js
// App glue: state, DOM refs, rendering, events

import { initThemeController } from './theme.js';
import { loadNotes, saveNotes } from './storage.js';
import { now, timeAgo } from './time.js';
import { confirmDialog } from './dialogs.js';
import { generateId, escapeHtml, byPinnedThenUpdated, matchesQuery } from './utils.js';

// ---- State ----
let notes = loadNotes();
let editingId = null;

// ---- DOM ----
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
const editBackdrop = editModal?.querySelector('.modal-backdrop');

// ---- Theme init ----
document.addEventListener('DOMContentLoaded', initThemeController);

// ---- Rendering ----
function refreshTimes() {
  listEl.querySelectorAll('.ts').forEach((el) => {
    const ts = Number(el.dataset.ts);
    if (!Number.isFinite(ts)) return;
    el.textContent = `Zuletzt geändert: ${timeAgo(ts)}`;
    el.setAttribute('title', new Date(ts).toLocaleString());
  });
}

function render() {
  const q = searchEl?.value.trim() || '';
  listEl.innerHTML = '';

  const filtered = notes
    .slice()
    .sort(byPinnedThenUpdated)
    .filter((n) => matchesQuery(n, q));

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

  filtered.forEach((n) => {
    const li = document.createElement('li');
    li.className = 'note' + (n.pinned ? ' pinned' : '');
    const ts = n.updatedAt || n.createdAt || now();
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

// ---- Events ----
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

  saveNotes(notes);
  form.reset();
  render();
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    form.requestSubmit();
  }
});

listEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === 'delete') {
    const ok = await confirmDialog({});
    if (!ok) return;
    notes = notes.filter((n) => n.id !== id);
    saveNotes(notes);
    render();
  } else if (action === 'edit') {
    const n = notes.find((n) => n.id === id);
    if (!n) return;
    editingId = id;
    editTitle.value = n.title;
    editContent.value = n.content;
    editModal.hidden = false;
    document.body.classList.add('no-scroll');
    setTimeout(() => editTitle.focus(), 0);
  } else if (action === 'toggle-pin') {
    const i = notes.findIndex((n) => n.id === id);
    if (i < 0) return;
    notes[i].pinned = !notes[i].pinned;
    notes[i].updatedAt = now();
    saveNotes(notes);
    render();
  }
});

editCancel.addEventListener('click', () => {
  editingId = null;
  editModal.hidden = true;
  document.body.classList.remove('no-scroll');
});
editBackdrop?.addEventListener('click', () => {
  editingId = null;
  editModal.hidden = true;
  document.body.classList.remove('no-scroll');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !editModal.hidden) {
    editingId = null;
    editModal.hidden = true;
    document.body.classList.remove('no-scroll');
  }
});

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

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshTimes();
});
searchEl.addEventListener('input', render);

// ---- Init ----
render();
setInterval(refreshTimes, 60_000);
