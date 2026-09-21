Get this Zen Tab Search Firefox extension project running locally. Execute the steps yourself — do not only list instructions.

This extension is Firefox/Zen only (MV2). `webExt.disabled` is intentional: `npm run dev` does not launch a browser. The user loads the temporary add-on by hand.

## Prerequisites

Confirm:

- Node.js 18 or newer (`node -v`). If it is missing or older, stop and say so. Do not install Node.
- npm (ships with Node). Do not switch package managers.

## Step 1: Install dependencies

From the repo root:

```bash
npm install
```

`prepare` installs Husky. `postinstall` runs `scripts/generate-icons.mjs` when `icon.png` exists. Leave `.env` as-is (`WXT_DEBUG=false`). Write `WXT_DEBUG=true` to gitignored `.env.local` only when the user asks for debug logs.

## Step 2: Verify

```bash
npm run check
```

That is typecheck, ESLint, and Vitest. Do not run `npm run format` across the tree during setup. Do not zip or release.

## Step 3: Start development

If a `npm run dev` / `wxt -b firefox` process is already running for this repo, leave it. Otherwise start it in the background:

```bash
npm run dev
```

It stays running. File changes rebuild into `.output/firefox-mv2/`. WXT's reload shortcut is disabled (`dev.reloadCommand: false`) because all four `suggested_key` slots are used; the file watcher still rebuilds.

Wait until the log reports a successful build and this file exists:

`.output/firefox-mv2/manifest.json`

## Step 4: Load in Zen Browser

Tell the user to:

1. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
2. Select `.output/firefox-mv2/manifest.json`
3. For Zen workspace APIs, set `extensions.experiments.enabled` to `true` in `about:config` and restart. `xpinstall.signatures.required` is only for installing a release zip, not for this temporary load.

Shortcuts (change them in `about:addons` → **Manage Extension Shortcuts**):

- `Ctrl+Shift+F` — in-page search overlay
- `Ctrl+Alt+F` — toolbar popup
- `Ctrl+Alt+T` — timer for the current tab
- `Ctrl+Alt+R` — forge label, or Zen's Change Label editor

## Step 5: Report

Summarize:

- Node version
- Whether `npm install` and `npm run check` passed
- Dev server status and the manifest path
- The load steps above
