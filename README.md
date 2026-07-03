# Zen Tab Search Anytime and Anywhere

Fuzzy tab and space search for Zen Browser with a modern omnibar overlay. This extension is exclusive to Zen Browser. It is a fork of [AntonDobrovinskiy/Zen-Tab-Search](https://github.com/AntonDobrovinskiy/Zen-Tab-Search) with a rewritten git history, migrated into a [WXT](https://wxt.dev/) development scaffold.

## Important notices

- This extension is exclusive to Zen Browser. It relies on Zen's internal workspace and tab APIs.
- You must enable two preferences in `about:config` and restart Zen Browser before the extension can function:
  - `extensions.experiments.enabled` → `true`
  - `xpinstall.signatures.required` → `false`
- This extension uses privileged `experiment_apis` to access Zen's internal workspace and tab APIs. Because of this, it cannot be published on addons.mozilla.org (AMO) and must be installed from a zip file.

## Installation

### From a GitHub release (recommended)

1. Download the latest `.zip` from the Releases page.
2. Open `about:config` in Zen Browser.
3. Set the following preferences:
   - `extensions.experiments.enabled` → `true`
   - `xpinstall.signatures.required` → `false`
4. Restart the browser.
5. Go to `about:addons`, click the gear icon, and choose **Install Add-on From File…**. Select the downloaded `.zip` (you can also drag the zip file onto the page).

### Build from source

```bash
npm install
npm run zip
```

The zip will be produced by WXT. Install it using the same `about:addons` → gear → **Install Add-on From File…** flow above.

## Usage

- `Ctrl+Shift+F` opens the in-page omnibar overlay when possible.
- `Ctrl+Alt+F` (or the toolbar button) opens the popup search UI, which works even when no web page tab is active.
- Type to filter tabs and spaces. Use arrow keys (or Page Up/Down with Left/Right for larger jumps), Enter to activate, and Escape to close.

## Features

- Fuzzy search across tab titles, URLs, and Zen custom tab labels
- Search and switch between Zen spaces
- Real-time results with keyboard navigation
- Works across all workspaces in Zen Browser via a privileged Experiment API

## Keyboard shortcuts

- `Ctrl+Shift+F` — Open in-page omnibar (when a content tab is active)
- `Ctrl+Alt+F` — Open popup search
- Arrow keys / Enter / Escape — Navigate and activate results

## Credits and license

This project is based on https://github.com/AntonDobrovinskiy/Zen-Tab-Search, which is released under the MIT license. Anton Dobrovinskiy retains the copyright as per the MIT license.

This repository is a fork of that project with rewritten git history.

See [LICENSE](LICENSE) for the full MIT license text.

## Why this cannot be published on AMO

Mozilla intentionally blocks extensions that declare `experiment_apis` (privileged Experiment APIs) from being submitted to addons.mozilla.org. Even if you obtain AMO API credentials and run `web-ext sign`, the resulting XPI will still require the two `about:config` changes on end-user machines for the Zen-specific APIs (`browser.zenTabs`) to be available.

The only supported distribution method for this extension is sideloading a zip (or XPI) as described above.

## Obtaining AMO API credentials (for contributors)

If you want to sign your own builds of a fork (for example, to test the `sign` and `download-signed` scripts), you can create credentials here:

https://addons.mozilla.org/developers/addon/api/key/

- "JWT issuer" becomes `AMO_JWT_ISSUER`
- "JWT secret" becomes `AMO_JWT_SECRET`

These credentials are only useful for signing builds of your own fork. They do not let you publish this extension publicly on AMO.

## Using dotenvx with your own credentials (contributors)

The committed `.envx.local` is encrypted with the maintainer's public key. Contributors cannot decrypt or use the existing AMO secrets.

If you wish to make your own version with your own credentials:

1. Copy `.envx.local` (or start a fresh one).
2. Edit it so it contains plaintext values and an empty public key:

   ```
   DOTENV_PUBLIC_KEY_LOCAL=""
   AMO_JWT_ISSUER=your_jwt_issuer_here
   AMO_JWT_SECRET=your_jwt_secret_here
   ```

3. Run:

   ```
   npx @dotenvx/dotenvx encrypt -f .envx.local
   ```

4. This produces (or updates) a local `.env.keys` file. Never commit `.env.keys`.

After this, `npm run env:use:local` followed by `npm run sign` (or `npm run download-signed`) will use your credentials.

## Development

**Using Cursor?** Run the [`/quick-start`](.cursor/commands/quick-start.md) command.

Otherwise:

```bash
npm install
npm run dev
```

Load in Zen Browser:

1. Open `about:debugging`
2. Click **This Firefox**
3. **Load Temporary Add-on…**
4. Select `manifest.json` from `.output/firefox-mv2/`

After code changes, reload the extension and refresh affected tabs.

Run quality checks:

```bash
npm run lint:js
npm run format
npm test
npm run lint
```

## Project structure

```
entrypoints/          WXT entrypoints (background, content script, popup)
public/experiment/    Privileged Experiment API (zenTabs) — required for cross-space Zen support
public/icon/          Extension icons
scripts/              Build, sign, and release helpers
```

## License

MIT — see [LICENSE](LICENSE). The original author (Anton Dobrovinskiy) retains copyright as per the MIT terms.
