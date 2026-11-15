# WatchPulse ⚡
### The Private, Keyboard-First Chaturbate Cam Monitor & Watchlist Studio

[![License: CC0-1.0](https://img.shields.io/badge/License-CC0_1.0-lightgrey.svg)](https://creativecommons.org/publicdomain/zero/1.0/)
[![Latest Release](https://img.shields.io/badge/Release-v3.0.6-brightgreen.svg)](https://github.com/PsychoBear10/WatchPulse/releases/latest)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue.svg)](https://github.com/PsychoBear10/WatchPulse/releases/latest)

> **WatchPulse** is a fast, clean, and completely private Windows desktop application designed to track your favorite Chaturbate models, preview streams silently, see who's live in real-time, and organize models into custom playlists with easy hotkeys and drag-and-drop boards.
>
> 🔒 **100% Offline & Private:** No accounts, no sign-ins, and no cloud tracking. All your watchlists and settings are stored locally on your own computer.

---

## ⚡ Quick Download & Getting Started

Getting started takes less than a minute:

1. Go to the **[Latest Release (v3.0.6)](https://github.com/PsychoBear10/WatchPulse/releases/latest)**.
2. Download your preferred version:
   - **`WatchPulse-3.0.6-Setup.exe`** *(Recommended)* — Quick installer that creates a desktop shortcut and keeps your data intact across updates.
   - **`WatchPulse-3.0.6-Portable.exe`** — Portable version. Just double-click to run without installing anything.
3. Open the app, paste a few model usernames or profile links, and you're ready to go!

---

## ✨ What WatchPulse Does (In Plain English)

### 🔴 Real-Time Live Cam Monitor & Watch Wall
- Instantly see which models on your list are **Online**, in **Private**, or **Offline**.
- View live room topics and viewer counts without opening heavy browser tabs.
- Open the **Watch Wall** to view multiple active live streams side-by-side in a clean multi-stream grid.
- **Auto-Drop Offline:** Automatically clears tiles when a stream ends so your wall only shows active cams.

### 🎧 Muted, Fast Stream Previews
- Click any model to open a silent, isolated live preview window.
- Check out streams without ads, video clutter, or accidentally blasting audio.

### 🗂️ Rapid Sorting & Custom Playlists (Triage Deck)
- **Keyboard Flashcard Sorting:** Quickly cycle through models like a deck of cards. Press a single key on your keyboard to send them to custom playlists (e.g., `1` for Favorites, `2` for VIP, `3` for Casual).
- **Kanban Board:** View and manage your models visually by dragging and dropping them between customizable playlist columns.
- **Smart Re-Sort Reminders:** Set reminders (e.g. every 14 days) so you can periodically check back on models and keep your lists fresh. Review queues are smoothly spread out day-by-day so you never get overwhelmed.

### ⏰ Smart Streaming Predictions
- Shows a helpful **"Usual · 85%"** badge when a model is currently within their regular streaming hours, helping you catch broadcasts right on time.

### 🎨 Apple-Style Liquid Glass Look
- A sleek, modern design with smooth rounded glass panels and soft ambient depth.
- Switch between three themes with one click: **Dark** (Midnight Obsidian), **Grey** (Space Gray Studio), or **Light** (Ice Glass).

---

## ⌨️ Useful Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + 1` | Switch to **Live Monitor** (Grid, Watch Wall & Stage) |
| `Ctrl + 2` | Switch to **Triage Deck** (Rapid Hotkey Sorter) |
| `Ctrl + 3` | Switch to **Visual Board** (Drag-and-Drop Kanban) |
| `Ctrl + 4` | Open **Silent Live Preview** |
| `Ctrl + F` or `/` | Quick search models anywhere on the Kanban board |
| `Space` | Skip to next model in Triage Deck |
| `Z` or `Backspace` | Undo last sort action |

---

## 🛠️ For Developers & Building from Source

If you want to modify WatchPulse or run it directly from source code:

### Requirements
- **Node.js** (v20 or newer recommended)
- **npm**

### Quick Setup

```bash
# 1. Install dependencies
npm install

# 2. Run unit tests
node scripts/run-tests.mjs

# 3. Start development server with hot-reload
npm run dev

# 4. Build Windows installer and portable .exe
npm run dist
```

---

## 📄 License

This project is dedicated to the public domain under the [Creative Commons Zero v1.0 Universal (CC0 1.0)](https://creativecommons.org/publicdomain/zero/1.0/) license. You are free to copy, modify, distribute, or run it, even for commercial purposes, without asking permission. See the [LICENSE](LICENSE) file for details.
