# Zen Tab Search

Fuzzy tab search for Zen Browser (and Firefox) with a modern omnibar overlay. Migrated from [AntonDobrovinskiy/Zen-Tab-Search](https://github.com/AntonDobrovinskiy/Zen-Tab-Search) into a [WXT](https://wxt.dev/) development scaffold.

## Features

- Fuzzy search across tab titles and URLs
- Real-time filtering with keyboard navigation
- `Alt+T` (Windows/Linux) or `Ctrl+T` (macOS) to open the omnibar
- Arrow keys, Enter, and Escape support

## Quick start

**Using Cursor?** Run the [`/quick-start`](.cursor/commands/quick-start.md) command.

Otherwise:

```bash
npm install
npm run dev
```

Load in Firefox or Zen Browser:

1. Open `about:debugging`
2. Click **This Firefox**
3. **Load Temporary Add-on…**
4. Select `manifest.json` from `.output/firefox-mv2/`

After code changes, reload the extension in `about:debugging` and refresh affected tabs.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Firefox](https://www.mozilla.org/firefox/) or [Zen Browser](https://zen-browser.app/) 78+

## Development

```bash
npm run dev      # WXT dev server with hot reload
npm run build    # Production build → .output/firefox-mv2/
npm run lint:js  # ESLint
npm run format   # Prettier
npm test         # Vitest (add tests under tests/)
npm run lint     # web-ext addons linter (builds first)
```

## Icons

Place `icon.png` in the repo root, then run:

```bash
npm run generate-icons
```

`postinstall` runs this automatically when `icon.png` is present.

## Signing for permanent install (AMO)

Mozilla Add-ons signing is required for permanent Firefox installation outside dev mode.

> **TODO:** Confirm AMO listing strategy for this fork (listed public add-on vs unlisted dev builds). See TODO comments in `scripts/sign.mjs` and `download-signed.js`.

AMO credentials are stored in the encrypted `.envx.local` file. Decrypt locally:

```bash
npm run env:use:local
npm run sign
npm run download-signed
```

Install via `about:addons` → gear → **Install Add-on From File…**

## Project structure

```
entrypoints/          WXT entrypoints (background, content script)
public/icon/          Extension icons (generated from icon.png)
scripts/              Build/sign helpers
tests/                Vitest tests (to be added)
```

## License

MIT — see [LICENSE](LICENSE).
