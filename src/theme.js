// theme.js
// Light/Dark theme controller with persistence

const THEME_KEY = 'mini-notes.theme'; // 'light' | 'dark'; null => system

export function loadThemeChoice() {
  return localStorage.getItem(THEME_KEY) ?? null;
}
export function saveThemeChoice(choice) {
  if (choice === null) localStorage.removeItem(THEME_KEY);
  else localStorage.setItem(THEME_KEY, choice);
}
export function applyTheme(choice) {
  const html = document.documentElement;
  if (choice === null) html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', choice);
}
export function getEffectiveTheme() {
  const choice = loadThemeChoice();
  if (choice === 'light' || choice === 'dark') return choice;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}
export function updateToggleUI() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const choice = loadThemeChoice();
  const effective = getEffectiveTheme();
  const isSystem = choice === null;
  btn.textContent = '🌓';
  btn.title = `Theme: ${isSystem ? `${effective} (system)` : effective} — click to toggle`;
  btn.setAttribute('aria-pressed', effective === 'dark' ? 'true' : 'false');
}
export function toggleTheme() {
  const effective = getEffectiveTheme();
  const next = effective === 'dark' ? 'light' : 'dark';
  saveThemeChoice(next);
  applyTheme(next);
  updateToggleUI();
}
export function resetToSystemTheme() {
  saveThemeChoice(null);
  applyTheme(null);
  updateToggleUI();
}
export function initThemeController() {
  applyTheme(loadThemeChoice());
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (mq?.addEventListener) {
    mq.addEventListener('change', () => {
      if (loadThemeChoice() === null) {
        applyTheme(null);
        updateToggleUI();
      }
    });
  }
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', toggleTheme);
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      resetToSystemTheme();
    });
  }
  updateToggleUI();
}
