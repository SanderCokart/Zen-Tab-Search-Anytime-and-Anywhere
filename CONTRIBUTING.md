# Contributing to Zen Tab Search Anytime and Anywhere

Thanks for your interest in contributing. This project is a fork (with rewritten git history) of Anton Dobrovinskiy's original Zen Tab Search under the MIT license. Anton retains the copyright as per the MIT terms.

## Development setup

Prerequisites:

- Node.js 18+
- npm
- Zen Browser (this extension is exclusive to Zen Browser)

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

While the dev server is running, WXT rebuilds and reloads the extension on file changes.

Load the extension temporarily:

1. Open `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on…**
4. Select `manifest.json` from `.output/firefox-mv2/`

**Cursor users:** You can also run the [`/quick-start`](.cursor/commands/quick-start.md) command.

## Quality gates (run before opening a PR)

```bash
npm run lint:js     # ESLint on entrypoints and scripts
npm run format      # Prettier (or use format:check to verify only)
npm test            # Vitest
npm run lint        # Builds first, then runs web-ext lint on the output
```

All checks should pass cleanly.

## Why AMO publishing is not viable for this extension

The extension declares `experiment_apis` in its manifest (see `wxt.config.ts` and `public/experiment/zenTabs/`). Mozilla intentionally disallows extensions using privileged Experiment APIs from being submitted to addons.mozilla.org, so this repository does not maintain an AMO signing flow.

The supported way to distribute this extension is via GitHub Releases as a zip file, with the installation instructions documented in the README.

## Pull requests

- Fork the repository and create a feature branch.
- Make focused, well-scoped changes.
- Run the quality gates above before opening a PR.
- Use clear commit messages. Conventional commits are welcome but not required.
- Reference any related issues in the PR description.

## Reporting issues

When filing a bug, please include:

- Zen Browser version
- Whether you have set `extensions.experiments.enabled` and `xpinstall.signatures.required` in `about:config` and restarted
- Steps to reproduce
- Any relevant console output from the background page or popup

For deeper diagnostics, you can send a `getDebugInfo` message to the background script (the background page listens for it and calls into the `zenTabs` experiment API when available).

## Release process (for maintainers)

The primary distribution mechanism is GitHub Releases, not AMO.

Use the release helper from a clean working tree with an authenticated GitHub CLI session:

```bash
npm run release -- patch --message "Maintenance release"
npm run release -- minor --notes-file ./RELEASE.md
```

The script bumps `package.json` and `package-lock.json`, commits the version change, creates an annotated tag, builds the WXT zip, creates a GitHub Release, and attaches the zip.

## Cursor commands

The files under `.cursor/commands/` are Cursor-specific automation helpers for internal development (quick-start, release notes, upgrades). External contributors can ignore them unless they are also using Cursor.

## License and attribution

This project is released under the MIT license. The original work is copyright Anton Dobrovinskiy as per the MIT license from the upstream repository: https://github.com/AntonDobrovinskiy/Zen-Tab-Search.

When contributing, you agree that your contributions will be licensed under the same MIT terms.

## Questions?

Open an issue or start a discussion. Be sure to check the README first for installation and usage details.
