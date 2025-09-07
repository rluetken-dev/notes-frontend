# notes-frontend

<p align="left">
  <a href="https://github.com/rluetken-dev/notes-frontend/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/rluetken-dev/notes-frontend/actions/workflows/ci.yml/badge.svg?branch=main">
  </a>
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg">
  <img alt="ESLint" src="https://img.shields.io/badge/lint-ESLint-4B32C3?logo=eslint&logoColor=white">
  <img alt="Prettier" src="https://img.shields.io/badge/format-Prettier-F7B93E?logo=prettier&logoColor=black">
  <img alt="Conventional Commits" src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg">
  <a href="https://github.com/rluetken-dev/notes-frontend/releases">
    <img alt="Release" src="https://img.shields.io/badge/release-v1.0.2-blue">
  </a>
</p>

A tiny, fast notes app as a **pure frontend** demo. No backend or bundler required — just open it via a local web server.

Pairs with **[notes-backend](https://github.com/rluetken-dev/notes-backend)**. This frontend is fully standalone (localStorage), the backend is optional.

> **Tech stack:** Vanilla JS (ES Modules), HTML5, CSS (Design Tokens, Light/Dark Mode), localStorage, ESLint (Flat Config), Prettier

---

## Table of Contents

- [Features](#features)
- [Demo](#demo)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Theming](#theming)
- [Searching with #tags](#searching-with-tags)
- [Backup (Export/Import)](#backup-exportimport)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Linting & Formatting](#linting--formatting)
- [Scripts](#scripts)
- [Commits & Changelog](#commits--changelog)
- [Data & Privacy](#data--privacy)
- [Roadmap](#roadmap)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Related](#related)

---

## Features

- ✍️ **Create / edit / delete notes**
- 📌 **Pin** important notes to keep them on top
- 🔎 **Live search** (title & content)
- #️⃣ **#tags in search** (AND filter; tags are extracted on-the-fly from title/content)
- ✨ **Search highlighting** (`<mark>` for text; highlighted tag chips)
- ⬇️⬆️ **Export / Import** (JSON; merge or replace existing notes)
- 🌓 **Dark Mode** with **system detection** & **toggle** (persisted in `localStorage`)
- 💾 **Persistence** via `localStorage`
- ⌨️ **Shortcut:** `Ctrl/Cmd + Enter` saves a new note
- ♿ **A11y:** `aria-live` for the list, visually hidden labels, clear focus ring
- 📱 **Responsive:** two-column layout, stacks on mobile

---

## Demo

<p align="center">
  <picture>
    <!-- Shown when GitHub is in dark mode -->
    <source media="(prefers-color-scheme: dark)"  srcset="assets/screenshot-dark.png?v=2">
    <!-- Shown when GitHub is in light mode -->
    <source media="(prefers-color-scheme: light)" srcset="assets/screenshot-light.png?v=2">
    <!-- Fallback for older clients -->
    <img src="assets/screenshot-light.png?v=2" alt="notes-frontend — screenshot" width="900">
  </picture>
</p>

<details>
  <summary>Show dark theme explicitly</summary>
  <p align="center">
    <img src="assets/screenshot-dark.png?v=2" alt="notes-frontend — dark theme" width="900">
  </p>
</details>

---

## Requirements

- **Browser:** recent versions of Chrome/Edge, Firefox, or Safari.
- **Node.js (optional — dev tools only):** Node **18+** (recommended **20+**) and npm. Not needed to _use_ the app, but helpful for `npm run lint`/`format` and CI.
- **Local web server:** required because of ES Modules (see Quick Start for options).

---

## Quick Start

> You do **not** need a bundler. Simply run a local server in the project root.

```bash
# 1) Clone the repo
git clone https://github.com/rluetken-dev/notes-frontend.git
cd notes-frontend

# 2) (optional) Install dev dependencies for lint/format
npm install

# 3) Start a local server (pick one)
# – VS Code: "Live Server" extension → open index.html → "Go Live"
# – npx:     npx http-server -c-1 -p 5173
# – python:  python -m http.server 5173

# 4) Open in the browser
# http://localhost:5173
```

> **Why a server?** Because of **ES Modules** (`<script type="module" src="src/app.js">`). Opening `index.html` via `file://` blocks module loading due to CORS and file protocol restrictions.

---

## Project Structure

```
notes-frontend/
├─ index.html              # App shell & markup (DE UI, English code comments)
├─ styles.css              # Design tokens, layout, components, dark mode
├─ src/
│  ├─ app.js              # Orchestration: state, render, events
│  ├─ storage.js          # loadNotes()/saveNotes() (localStorage)
│  ├─ theme.js            # Theme controller (toggle, system, persistence)
│  ├─ time.js             # now(), timeAgo() (de-DE)
│  ├─ dialogs.js          # confirmDialog() using the modal
│  ├─ backup.js           # exportNotes()/parseImportedFile()/mergeNotes()
│  └─ utils.js            # generateId(), escapeHtml(), sort, match, tags, highlight
├─ assets/
│  ├─ screenshot-light.png
│  └─ screenshot-dark.png
├─ eslint.config.mjs       # ESLint Flat Config (ESM, browser)
├─ .prettierrc.json        # Prettier config
├─ .prettierignore
├─ package.json            # npm scripts (lint/format), dev deps
├─ commits.md              # Conventional Commits Leitfaden
├─ .github/
│  └─ workflows/
│     └─ ci.yml            # minimal CI (Node 20 + Prettier check)
└─ README.md               # you are here

```

---

## Theming

- **Design tokens** in `:root` (light defaults) + dark variants via `@media (prefers-color-scheme: dark)`.
- **Explicit override** via `html[data-theme="light|dark"]` (set by the toggle button).
- **No hard-coded colors** in components — everything derives from tokens.

**Token highlights:** `--bg`, `--text`, `--muted`, `--card`, `--border`, `--primary`, `--on-primary`, `--danger`, `--on-danger`, `--input-border`, `--accent`, `--accent-bg`, `--accent-ring`, `--empty-border`, `--empty-bg`, `--empty-text`.

---

## Searching with #tags

- Write tags anywhere in **title or content** using `#like-this` (letters, digits, `_` and `-`).
- Query supports **free text** and **tags** together.
- **All tags must match** (AND). Free text matches if it appears in title **or** content.

**Examples**

- `#work` → notes tagged `#work`
- `#work #inbox` → notes that have **both** tags
- `meeting` → full-text search
- `meeting #work` → full-text **and** tag filter

---

## Backup (Export/Import)

- **Export (.json):** downloads a file like `notes-frontend-YYYYMMDD-HHMMSS.json`.
- **Import (.json):** choose a file; you can **Replace** all notes or **Merge** with existing ones.
  - **Merge rule:** for identical `id`s, the item with the **newer `updatedAt`** wins.
- The **Export** button is disabled when there are no notes yet.

**JSON shape**

```json
{
  "app": "notes-frontend",
  "version": 1,
  "exportedAt": 1690000000000,
  "notes": [
    {
      "id": "…",
      "title": "…",
      "content": "…",
      "createdAt": 1690000000000,
      "updatedAt": 1690000000000,
      "pinned": false
    }
  ]
}
```

**Tip:** `localStorage` is **origin-scoped** — `http://localhost:5173` and `http://127.0.0.1:5173` are different stores.

---

## Keyboard Shortcuts

- **Save new note:** `Ctrl/Cmd + Enter`
- **Theme toggle:** click `🌓`
  - Right-click on `🌓` → reset to **System**

---

## Linting & Formatting

```bash
# Lint (Flat Config)
npm run lint

# Format (Prettier)
npm run format
```

**Notes:**

- ESLint uses the **Flat Config** (`eslint.config.mjs`). Remove legacy `.eslintrc.*` files.
- Prettier handles formatting; ESLint focuses on code quality.

---

## Scripts

- `npm run format` – format code with Prettier
- `npm run format:check` – verify formatting
- `npm run lint` – ESLint (Flat Config)

---

## Commits & Changelog

This repo follows **Conventional Commits** to keep history and changelogs clean.  
See **[commits.md](./commits.md)** for the rules, allowed types, scopes, and examples.

**Examples**

- `feat(ui): add search highlight for tags`
- `fix(storage): handle empty import file gracefully`
- `docs: update README with screenshots`
- `chore(prettier): format markdown`

**Releases**

- Tag releases as `vX.Y.Z` (SemVer).
- Keep release notes concise and link the compare view.

---

## Data & Privacy

- All data is stored **locally in the browser** via `localStorage`.
- **No** data is sent to any server.
- You can clear storage manually in your browser at any time.
- Backups are plain **JSON** files; review them before sharing.
- Note: storage is **origin-scoped** (`http://localhost:5173` ≠ `http://127.0.0.1:5173`).

---

## Roadmap

- Tag management (rename/delete, suggestions while typing)
- Result snippets (show a short context around search hits)
- Sorting options (e.g., by `updatedAt`, `title`)
- Markdown preview (read-only render)
- PWA (offline, installable)
- IndexedDB storage (scales better than localStorage)
- Tests: unit (Vitest) & end-to-end (Playwright)
- A11y polish: focus trap in modals, improved keyboard navigation

---

## Deployment

- **GitHub Pages:** static hosting — publish the `main` branch or a `docs/` folder.
- **Netlify/Vercel:** set up as a “Static Site”, leave the build command empty, publish the repo root.

---

## Troubleshooting

**ES Modules won’t load?**

- Use `http://localhost:…` (not `file://`).
- Ensure your HTML has:
  ```html
  <script type="module" src="src/app.js"></script>
  ```
- Check the server root: the browser must find `/src/app.js` relative to `index.html`.

**ESLint complains about `import/export`?**

- Confirm you use the Flat Config: **`eslint.config.mjs`** at the project root.
- Remove legacy `.eslintrc.*` files.
- If needed, set `languageOptions.sourceType = "module"` in the flat config.

**Dark Mode doesn’t change?**

- Make sure the `#theme-toggle` button exists in `index.html`.
- Check for a hard-coded `data-theme` on `<html>` that could force a theme.
- Open DevTools → Console for `localStorage` errors (e.g., private mode).

**Export button is disabled?**

- That’s by design when there are **no notes** yet. Create a note first.

**Import seems to do nothing?**

- Verify the JSON format (see **Backup** section).
- On conflicts (same `id`), the note with the **newer `updatedAt`** wins.
- Reminder: `localStorage` is **origin-scoped** (`localhost` ≠ `127.0.0.1`).

**Search feels off?**

- Tag filters are **AND** combined: `#work #inbox` requires **both**.
- Free-text matches title **or** content; highlighting is simple substring matching.

---

## License

MIT — feel free to use, learn, and extend.

---

## Related

- Backend: https://github.com/rluetken-dev/notes-backend
- Frontend: https://github.com/rluetken-dev/notes-frontend
