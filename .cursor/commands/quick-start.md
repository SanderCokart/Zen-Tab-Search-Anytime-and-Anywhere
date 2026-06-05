Get this Firefox extension project running locally. Execute the steps yourself — do not only list instructions.

## Prerequisites

Confirm or install:

- Node.js 18+
- Firefox 140+
- npm (ships with Node)

## Step 1: Install dependencies

From the repo root:

```bash
npm install
```

`postinstall` runs `scripts/generate-icons.mjs` automatically.

## Step 2: Start development

```bash
npm run dev
```

WXT rebuilds on file changes. Output goes to `.output/firefox-mv2/`.

## Step 3: Load in Firefox

Tell the user to:

1. Open `about:debugging`
2. Click **This Firefox**
3. **Load Temporary Add-on…**
4. Select `manifest.json` from `.output/firefox-mv2/`

After code changes: reload the extension in `about:debugging`, then refresh affected tabs.

## Step 4: Verify the setup

Run a quick sanity check:

```bash
npm test
npm run build
```

Report pass/fail for each command.

## Step 5: Optional — AMO signing credentials

Only mention if the user needs permanent install (not temporary debugging):

1. Mozilla API credentials: https://addons.mozilla.org/developers/addon/api/key/
2. Decrypt local env: `npm run env:use:local`
3. Edit `.env` with `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`
4. Re-encrypt: `npm run env:encrypt:local`
5. Keep `.env.keys` local (gitignored)

## Step 6: Report

Summarize:

- Whether install and dev server succeeded
- Path to load the extension
- Test/build results
- Next commands: `npm run lint:js`, `npm run format`, `npm run sign`
