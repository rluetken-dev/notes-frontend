// theme.js
// Light/Dark theme controller with persistence
// -------------------------------------------------
// This module controls theming for the app.
// It stores an explicit user choice ('light' | 'dark') in localStorage.
// If no explicit choice is stored (null), the UI falls back to the OS theme
// via CSS: @media (prefers-color-scheme: dark) { ... }.
// The CSS must define token sets for:
//   html[data-theme="light"] { ... } and html[data-theme="dark"] { ... }
// so that applying/removing the data-theme attribute immediately updates colors.

/** Storage key for persisting the user's explicit theme choice. */
const THEME_KEY = 'mini-notes.theme'; // 'light' | 'dark'; null => system

/**
 * Load the user's explicit theme choice.
 * Returns 'light' or 'dark' if the user chose explicitly, otherwise null.
 *
 * @returns {'light'|'dark'|null}
 */
export function loadThemeChoice() {
  return localStorage.getItem(THEME_KEY) ?? null;
}

/**
 * Persist an explicit theme choice, or clear it to revert to system.
 *
 * @param {'light'|'dark'|null} choice
 *   'light' / 'dark'  → force that theme until changed
 *   null              → remove override and use system preference
 * @returns {void}
 */
export function saveThemeChoice(choice) {
  if (choice === null) localStorage.removeItem(THEME_KEY);
  else localStorage.setItem(THEME_KEY, choice);
}

/**
 * Apply the given theme choice to <html>.
 * - null → remove data-theme attribute so CSS @media decides (system)
 * - 'light' / 'dark' → set data-theme accordingly
 *
 * @param {'light'|'dark'|null} choice
 * @returns {void}
 */
export function applyTheme(choice) {
  const html = document.documentElement;
  if (choice === null) html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', choice);
}

/**
 * Compute the *effective* theme that is currently (or would be) in use.
 * If the user has an explicit choice, return that.
 * Otherwise infer from the OS setting using matchMedia.
 *
 * @returns {'light'|'dark'}
 */
export function getEffectiveTheme() {
  const choice = loadThemeChoice();
  if (choice === 'light' || choice === 'dark') return choice;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

/**
 * Update the toggle button UI (label, tooltip, aria state)
 * to reflect the current effective theme and whether we're on "system".
 *
 * @returns {void}
 */
export function updateToggleUI() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  const choice = loadThemeChoice(); // 'light' | 'dark' | null
  const effective = getEffectiveTheme(); // 'light' | 'dark'
  const isSystem = choice === null;

  btn.textContent = '🌓'; // keep the icon; could be replaced with text if preferred
  btn.title = `Theme: ${isSystem ? `${effective} (system)` : effective} — click to toggle`;
  btn.setAttribute('aria-pressed', effective === 'dark' ? 'true' : 'false');
}

/**
 * Toggle between light and dark (based on the current *effective* theme)
 * and persist the explicit choice.
 *
 * @returns {void}
 */
export function toggleTheme() {
  const effective = getEffectiveTheme();
  const next = effective === 'dark' ? 'light' : 'dark';
  saveThemeChoice(next);
  applyTheme(next);
  updateToggleUI();
}

/**
 * Reset theming back to system preference (remove explicit override).
 *
 * @returns {void}
 */
export function resetToSystemTheme() {
  saveThemeChoice(null);
  applyTheme(null);
  updateToggleUI();
}

/**
 * Initialize the theme system:
 * - Apply stored choice (or system if none).
 * - React to OS theme changes when no explicit choice is set.
 * - Wire up the toggle button (left-click toggles; right-click resets to system).
 * - Sync the button UI on load.
 *
 * Call this once after DOMContentLoaded.
 *
 * @returns {void}
 */
export function initThemeController() {
  // Apply any stored explicit choice; null means "system".
  applyTheme(loadThemeChoice());

  // If there is no explicit choice, reflect live OS theme changes.
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (mq?.addEventListener) {
    mq.addEventListener('change', () => {
      if (loadThemeChoice() === null) {
        applyTheme(null); // keep following system preference
        updateToggleUI();
      }
    });
  }

  // Hook up the toggle button interactions.
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    // Left click: toggle between light/dark explicitly.
    btn.addEventListener('click', toggleTheme);

    // Context menu (right-click): reset to system preference.
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      resetToSystemTheme();
    });
  }

  // Ensure the UI matches the current state right away.
  updateToggleUI();
}
