# CCV Shop - Development Helper (Firefox)

Firefox extension for CCV Shop theme and integration development. Features:

- **Environment bar** — colored footer on CCV Shop pages showing node/theme context
- **Message extraction** — collect conversations from Freshdesk tickets and GitLab discussions

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Firefox](https://www.mozilla.org/firefox/) 140+

## Setup

```bash
npm install
```

## Development

Start the WXT dev server (rebuilds on file changes):

```bash
npm run dev
```

Load the extension in Firefox:

1. Open `about:debugging`
2. Click **This Firefox**
3. **Load Temporary Add-on…**
4. Select `manifest.json` from `.output/firefox-mv2/`

After code changes, reload the extension in `about:debugging` and refresh affected tabs.

## Build

```bash
npm run build
```

Output: `.output/firefox-mv2/`

## Quality checks

```bash
npm run lint:js    # ESLint
npm run format     # Prettier
npm test           # Vitest extractor tests
npm run lint       # web-ext addons linter (builds first)
```

## Adding a new message extractor

1. Create `lib/extractors/my-source.ts` implementing `MessageExtractor`
2. Register it in `lib/extractors/registry.ts`
3. Add URL `matches` to `entrypoints/message-collector.content.ts` if needed
4. Add tests under `tests/extractors/`

No manifest edits required — WXT generates the manifest from entrypoints.

## Signing for permanent install (AMO)

Mozilla Add-ons signing is required for permanent Firefox installation outside dev mode.

1. Create API credentials: https://addons.mozilla.org/developers/addon/api/key/
2. Store them in the encrypted `.envx.local` file (committed to git):

```bash
cp .env.example .env
# Edit .env with your AMO_JWT_ISSUER and AMO_JWT_SECRET
npm run env:encrypt:local
```

To update credentials later:

```bash
npm run env:use:local      # decrypt .envx.local → .env
# edit .env
npm run env:encrypt:local  # save encrypted changes back to .envx.local
```

Keep `.env.keys` local only (gitignored). Plaintext `.env` is also gitignored.

3. Sign (decrypts automatically):

```bash
npm run sign
```

4. When approved, download the signed XPI:

```bash
npm run download-signed
```

5. Install via `about:addons` → gear → **Install Add-on From File…**

For CI, set `DOTENV_PRIVATE_KEY` from `.env.keys` instead of committing that file.

## Project structure

```
entrypoints/          WXT entrypoints (background, popup, content scripts)
lib/                  Shared code and extractors
public/icon/          Extension icons
scripts/              Build/sign helpers
tests/                Vitest tests
```
