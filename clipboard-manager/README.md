# GD Clipboard

A small clipboard manager for Windows, macOS and Linux. Every time you copy
something it is saved (the last **10–15 items**, your choice). Press a shortcut
to open the picker, choose an item, and it is pasted into the app you were in.

Items are sorted into sections:

| Section | What goes there |
|---------|-----------------|
| Text    | Normal copied text |
| Links   | URLs (one or several) |
| Code    | Snippets, JSON, HTML, SQL… |
| Colors  | `#hex`, `rgb()`, `hsl()` values, shown with a swatch |
| Images  | Screenshots and copied pictures, shown as thumbnails |
| Files   | Files/folders copied in Explorer/Finder, grouped by kind: Folders, Images, Design (PSD, AI, Figma, InDesign…), Documents, Video, Audio, Archives, Fonts, Code, Programs, Other |

## Use it

- **Copy** as normal (`Ctrl+C` / `Cmd+C`).
- **Open the picker:** `Ctrl+Shift+V` (`Cmd+Shift+V` on Mac), or click the tray icon.
- **Pick:** click an item, or use `↑` `↓` + `Enter`, or press `1`–`9` / `0` to paste that item straight away.
- `Tab` / `←` `→` switch sections, type to search, `Esc` closes.
- `Shift+Enter` pastes as plain text (files become their paths), `Ctrl+Enter` only copies.
- `Ctrl+P` pins an item so it is never pushed out; `Delete` removes one.

Right-click the tray icon to change how many items to keep (10–15), change the
shortcut, turn auto-paste off, pause saving, start with your computer, or clear
the history. History is kept between restarts (pinned items survive "Clear").

### Auto-paste permissions

- **macOS:** allow GD Clipboard in *System Settings → Privacy & Security → Accessibility*.
- **Linux:** install `xdotool`.
- If auto-paste isn't possible the item is still on your clipboard — just press paste.

## Run from source

Requires [Node.js](https://nodejs.org) 18+.

```bash
cd clipboard-manager
npm install
npm start
```

## Build an installer

```bash
npm run dist:win   # Windows installer + portable .exe (run on Windows)
npm run dist:mac   # macOS .dmg (run on a Mac)
```

Output goes to `clipboard-manager/dist/`.

## Tests

```bash
npm test
```
