Get this Zen Tab Search Firefox extension project running locally. Execute the steps yourself — do not only list instructions.

## Prerequisites

Confirm or install:

- Node.js 18+
- Firefox or Zen Browser 78+
- npm (ships with Node)

## Step 1: Install dependencies

From the repo root:

```bash
npm install
```

`postinstall` runs `scripts/generate-icons.mjs` automatically when `icon.png` exists.

## Step 2: Start development

```bash
npm run dev
```

WXT rebuilds on file changes and reloads the extension automatically. Output goes to `.output/firefox-mv2/`.

## Step 3: Load in Firefox or Zen Browser

Tell the user to:

1. Open `about:debugging`
2. Click **This Firefox**
3. **Load Temporary Add-on…**
4. Select `manifest.json` from `.output/firefox-mv2/`

Test the omnibar with `Alt+T` (or `Ctrl+T` on macOS).

## Step 4: Verify the setup

Run a quick sanity check:

```bash
npm test
npm run build
```

Report pass/fail for each command.

## Step 5: Release note

If the user asks about permanent installs, explain that this extension is distributed through GitHub release zips because privileged Experiment APIs cannot be submitted to AMO.

## Step 6: Report

Summarize:

- Whether install and dev server succeeded
- Path to load the extension
- Test/build results
- Next commands: `npm run lint:js`, `npm run format`, `npm run release -- patch --message "..."`
