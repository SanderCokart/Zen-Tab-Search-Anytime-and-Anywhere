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

Mozilla intentionally blocks extensions that declare `experiment_apis` (privileged Experiment APIs) from being submitted to addons.mozilla.org, so this repository does not maintain an AMO signing flow. End users still need the two `about:config` changes for the Zen-specific APIs (`browser.zenTabs`) to be available.

The only supported distribution method for this extension is sideloading a zip (or XPI) as described above.

## Creating a release

Releases are published as GitHub release zips. The release script bumps the package version, commits the version files, tags the commit, builds the extension zip, creates a GitHub release, and attaches the zip.

```bash
npm run release -- patch --message "Maintenance release"
npm run release -- minor --notes-file ./RELEASE.md
npm run release -- patch --generate-notes
npm run release -- patch --dry-run --generate-notes
```

Use `patch`/`bump`, `minor`, `major`, or an exact `x.y.z` version. Release notes can be supplied with `--message`, loaded with `--notes-file`, or generated from commits since the latest tag with `--generate-notes`. The script requires a clean working tree and an authenticated GitHub CLI session (`gh auth login`) before it starts.

Release checklist:

1. Start from `main` with `git status` clean.
2. Confirm GitHub CLI auth with `gh auth status`.
3. Preview the release with `npm run release -- patch --dry-run --generate-notes`.
4. Run the release command, for example `npm run release -- patch --generate-notes`.
5. Confirm the GitHub release contains the `zen-tab-search-<version>-firefox.zip` asset.

If a release fails, follow the recovery instructions printed by the script before retrying.

## Development

**Using Cursor?** Run the [`/quick-start`](.cursor/commands/quick-start.md) command.

Otherwise:

```bash
npm install
npm run dev
```

While the dev server is running, WXT rebuilds and reloads the extension on file changes.

Load in Zen Browser:

1. Open `about:debugging`
2. Click **This Firefox**
3. **Load Temporary Add-on…**
4. Select `manifest.json` from `.output/firefox-mv2/`

Run quality checks:

```bash
npm run lint:js
npm run format
npm test
npm run lint:web-ext
```

Pre-commit hooks run through Husky and lint-staged. They format staged JSON, Markdown, and CSS files, run ESLint fixes for staged JavaScript/TypeScript files, and run the `web-ext` lint wrapper when extension files change. The wrapper allows the known privileged `experiment_apis` finding because this project is distributed as a sideload-only Zen Browser zip.

## Project structure

```
entrypoints/          WXT entrypoints (background, content script, popup)
public/experiment/    Privileged Experiment API (zenTabs) — required for cross-space Zen support
public/icon/          Extension icons
scripts/              Build and release helpers
```

## License

MIT — see [LICENSE](LICENSE). The original author (Anton Dobrovinskiy) retains copyright as per the MIT terms.
