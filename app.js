// ==================================================
// Mini Notes App
// ==================================================

// ---- Storage + State ----

// Key for localStorage
const STORAGE_KEY = 'mini-notes.v1';

// Load notes from localStorage
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

// Save notes to localStorage
function save(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

// Global state: list of notes
let notes = load();

// ---- DOM References ----
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
const confirmBackdrop = confirmModal.querySelector('.modal-backdrop');
const editBackdrop = editModal.querySelector('.modal-backdrop');

let editingId = null; // stores the ID of the note being edited

// ---- Helper Functions ----
const now = () => Date.now();

// Fallback ID generator (uses randomUUID, otherwise random string)
const generateId = () =>
  crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

// Relative "time ago" in German
const rtf = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });

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

function refreshTimes() {
  listEl.querySelectorAll('.ts').forEach((el) => {
    // <— before: document.querySelectorAll('#notes .ts')
    const ts = Number(el.dataset.ts);
    if (!Number.isFinite(ts)) return;
    el.textContent = `Zuletzt geändert: ${timeAgo(ts)}`;
    el.setAttribute('title', new Date(ts).toLocaleString());
  });
}

// Sort pinned first, then by updatedAt (desc)
const byPinnedThenUpdated = (a, b) => {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1; // pinned on top
  return (b.updatedAt ?? 0) - (a.updatedAt ?? 0); // newest first
};

// Check if a note matches a search query
const matchesQuery = (n, q) => {
  if (!q) return true;
  q = q.toLowerCase();
  return (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
};

// Escape HTML to prevent XSS attacks
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[m];
  });
}

function confirmDialog({
  title = 'Notiz löschen?',
  text = 'Diese Aktion kann nicht rückgängig gemacht werden.',
} = {}) {
  return new Promise((resolve) => {
    // Set content
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
      confirmBackdrop.removeEventListener('click', onBack);
      document.removeEventListener('keydown', onKey);
      confirmModal.hidden = true;
      document.body.classList.remove('no-scroll');
      resolve(result);
    }

    // Wire once
    confirmOk.addEventListener('click', onOk, { once: true });
    confirmCancel.addEventListener('click', onCancel, { once: true });
    confirmBackdrop.addEventListener('click', onBack, { once: true });
    document.addEventListener('keydown', onKey);

    // Focus for quick confirm via Enter
    setTimeout(() => confirmOk.focus(), 0);
  });
}

// ---- Rendering ----
function render() {
  const q = searchEl.value.trim();
  listEl.innerHTML = '';

  const filtered = notes
    .slice() // avoid in-place sort
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

// ---- Event Listeners ----

// Handle new note submission
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

// Shortcut: Ctrl+Enter to save a note
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    form.requestSubmit();
  }
});

// Handle clicks on "Edit","Delete" and "Pin" buttons
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
    setTimeout(() => editTitle.focus(), 0); // Focus for better UX
  } else if (action === 'toggle-pin') {
    const i = notes.findIndex((n) => n.id === id);
    if (i < 0) return;
    notes[i].pinned = !notes[i].pinned;
    notes[i].updatedAt = now(); // sorgt für sinnvolle Sortierung
    save(notes);
    render();
  }
});

// Cancel editing
editCancel.addEventListener('click', () => {
  editingId = null;
  editModal.hidden = true;
  document.body.classList.remove('no-scroll');
});

editBackdrop.addEventListener('click', () => {
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

// Save edited note
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

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshTimes();
});

// Search in real-time
searchEl.addEventListener('input', render);

// ---- Init ----
// Initial render when page loads
render();
setInterval(refreshTimes, 60000); // Refresh every 60 seconds
