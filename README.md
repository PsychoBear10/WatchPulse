# WatchPulse ⚡
### Live Chaturbate Cam Monitor, Silent Preview & Rapid Triage Studio

[![License: CC0-1.0](https://img.shields.io/badge/License-CC0_1.0-lightgrey.svg)](https://creativecommons.org/publicdomain/zero/1.0/)
[![Latest Release](https://img.shields.io/badge/Release-v3.0.0-brightgreen.svg)](https://github.com/PsychoBear10/WatchPulse/releases/latest)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Electron](https://img.shields.io/badge/Electron-34-47848f.svg)](https://www.electronjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff.svg)](https://vitejs.dev/)

> A standalone, keyboard-first desktop application (Electron + Vite + React + TypeScript) for live Chaturbate cam monitoring, silent multi-stream previews, periodic tier maintenance, rapid deck sorting, drag-and-drop Kanban organization, and full master grid management.

---

## 🚀 Download & Installation

**Latest Release: WatchPulse v3.0.0** (Major update featuring an Apple-style liquid glass design, three-way theme switcher, and keyboard Kanban search).

### Windows Download:
1. Head to the **[Latest Release (v3.0.0)](https://github.com/PsychoBear10/WatchPulse/releases/latest)** page.
2. Download:
   - **`WatchPulse-3.0.0-Setup.exe`** — Recommended Windows installer with desktop shortcut and automated in-place data preservation.
   - **`WatchPulse-3.0.0-Portable.exe`** — Standalone, zero-install portable executable.
3. Run the installer and launch WatchPulse. All data is kept 100% offline, local, and private.

---

## Key Features

- **Liquid Glass UI & Three-Way Theme Switcher:** macOS/visionOS-inspired frosted acrylic aesthetic with squircle containers and top-edge specular glints. Switch seamlessly between **Dark** (Midnight Obsidian), **Grey** (Space Gray Studio), and **Light** (Ice Glass).
- **Live Monitor & Silent Live View (`Ctrl+4`):** Track online, public, private, and offline status counts per tier. View real-time room topics and viewer counts, with an isolated, muted Electron `<webview>` preview featuring `Live Stream Embed`, `CBExplorer`, and `CBHours Stats` tabs.
- **Periodic Re-Sort & 7×24 Activity Heatmap:** Track `lastReviewedAt` and `lastSeenLiveAt`, set per-tier review cadences, filter Rapid Sorter by **Due for Re-sort**, view locally logged 30-day active hours alongside 7×24 activity heatmaps, and see live **Usual · {confidencePct}%** schedule badges.
- **Dynamic Tier & Category Manager (No Hardcoded Lists):** Create, rename, reorder (drag or arrow buttons), color-code, assign single-key hotkeys, and safely delete custom tiers. Customize the default **Unsorted / Inbox** state.
- **CSV Import, Clipboard Paste & Regex Sanitizer:** Ingest `Model Name` / `Original Link` CSVs, TSVs, or plain username/URL lists while preserving leading/trailing underscores and hyphens (`_bamby_baby_`, `yvie_`). Automatically generates `CBHours`, `CBExplorer`, and `ArchiveBate` links.
- **Three Synchronized Views:**
  - **Rapid Sorter:** Hotkey deck sorting, `Space` to skip, `Z`/`Backspace` undo, and quick-edit model inspector.
  - **Kanban Board:** Multi-column drag-and-drop workflow with real-time online status badges, fast keyboard search (<kbd>Ctrl+F</kbd> / <kbd>/</kbd>), match counter, and <kbd>Enter</kbd> card jump.
  - **Master Data Grid:** Deep search, multi-field filtering, inline editing, and bulk actions.
- **45-Day Recycling Bin & Local-First Persistence:** Atomically persisted local JSON storage (`watchpulse-data.json` + `.bak.json` in `%APPDATA%\watchpulse`, with automatic migration from legacy `%APPDATA%\modelsort-studio`) and local thumbnail caching (`local-media://`). Deleted models remain recoverable in the Recycling Bin for 45 days before automatic purge.

---

## Development & Build Scripts

```bash
# Install dependencies
npm install

# Run unit tests (sanitizer, CSV importer, exporter, JSON storage, activity stats)
npm test

# Regenerate CHANGELOG.docx from changelog.json
npm run changelog

# Start Vite dev server + Electron window with hot reload
npm run dev

# Type-check and compile Electron + Vite production bundles
npm run build

# Build in-place NSIS update installer (.exe) + update CHANGELOG.docx -> release/
npm run dist:nsis

# Package standalone portable Windows executable (.exe) + update CHANGELOG.docx -> release/
npm run dist:portable

# Package both portable .exe and NSIS update installer (.exe) -> release/
npm run dist
```

---

## Versioning, Updates & Changelog Policy

- **First Public Release:** Launched publicly at `v2.0.9`.
- **Major feature releases** increment to `v3` (`3.0.0`), `v4` (`4.0.0`), etc.
- **Minor updates & fixes** increment `.xx` (`v2.09` → SemVer `2.0.9`, `v2.10` → `2.10.0`).
- **Update-in-Place Data Preservation:** The app keeps `appId` (`com.modelsort.studio`) and `deleteAppDataOnUninstall: false` consistent across every release, upgrading binaries in place while preserving all data in `%APPDATA%\watchpulse\watchpulse-data.json`.
- **Word Changelog (`CHANGELOG.docx`):** Release notes live in `changelog.json` and regenerate `CHANGELOG.docx` automatically via `npm run changelog` (also wired into `dist`, `dist:nsis`, and `dist:portable`).

> **Note on Windows Builds:** `build.win.signAndEditExecutable` is set to `false` in `package.json` so `electron-builder` does not attempt to extract `winCodeSign` (which contains macOS symlinks that fail on Windows without Developer Mode or Administrator privileges). If you enable Windows Developer Mode and provide code-signing certificates, you can switch it back to `true`.

---

## Architecture

- `electron/main.ts` — Main process, window lifecycle, custom `local-media://` protocol for local image thumbnails, native file/export dialogs, and IPC handlers.
- `electron/preload.ts` — Context-isolated `window.electronAPI` bridge.
- `electron/storage.ts` — Atomic JSON persistence with backup rotation and schema sanitization.
- `src/store/useAppStore.tsx` — Centralized state management, undo stack, and debounced disk persistence.
- `src/utils/sanitizer.ts` — Regex username sanitizer and enrichment URL builder.
- `src/utils/csvImporter.ts` — PapaParse-powered CSV/TSV/list ingestion and duplicate detection.
- `src/utils/exporter.ts` — CSV, JSON, and grouped plain-text summary generators.
- `src/components/views/` — `RapidSorterView.tsx`, `KanbanView.tsx`, and `DataGridView.tsx`.
- `src/components/modals/` — `TierManagerModal.tsx`, `ImportModal.tsx`, `ModelEditorModal.tsx`, `ExportModal.tsx`, and `SettingsModal.tsx`.

---

## License

This project is dedicated to the public domain under the [Creative Commons Zero v1.0 Universal (CC0 1.0)](https://creativecommons.org/publicdomain/zero/1.0/) license. You are free to copy, modify, distribute, and perform the work, even for commercial purposes, without asking permission. See the [LICENSE](LICENSE) file for the full legal text.
