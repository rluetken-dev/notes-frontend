// storage.js
// Small persistence helpers for notes

const STORAGE_KEY = 'mini-notes.v1';

/** Load notes array from localStorage; returns [] on errors. */
export function loadNotes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

/** Save notes array to localStorage. */
export function saveNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}
