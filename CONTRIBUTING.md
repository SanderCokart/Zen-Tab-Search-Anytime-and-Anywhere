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

Load the extension temporarily:

1. Open `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on…**
4. Select `manifest.json` from `.output/firefox-mv2/`

After code changes, reload the extension in `about:debugging`, then refresh any affected tabs.

**Cursor users:** You can also run the [`/quick-start`](.cursor/commands/quick-start.md) command.

## Quality gates (run before opening a PR)

```bash
npm run lint:js     # ESLint on entrypoints and scripts
npm run format      # Prettier (or use format:check to verify only)
npm test            # Vitest
npm run lint        # Builds first, then runs web-ext lint on the output
```

All checks should pass cleanly.

## Handling secrets and dotenvx (important)

This project uses `@dotenvx/dotenvx` to manage Mozilla Add-ons API credentials (used by the `sign` and `download-signed` scripts). The committed `.envx.local` is encrypted with the maintainer's public key.

Contributors cannot decrypt or use the existing AMO secrets from the repository.

### If you want to sign your own builds (optional)

1. Obtain your own AMO API credentials (see the section below).
2. Create or edit a local `.envx.local` with an empty public key and your plaintext values:

   ```
   DOTENV_PUBLIC_KEY_LOCAL=""
   AMO_JWT_ISSUER=your_jwt_issuer_here
   AMO_JWT_SECRET=your_jwt_secret_here
   ```

3. Encrypt it:

   ```
   npx @dotenvx/dotenvx encrypt -f .envx.local
   ```

4. This creates or updates a local `.env.keys` file. Never commit `.env.keys` or any plaintext secrets.

After this, you can run:

```bash
npm run env:use:local   # decrypts into .env (gitignored)
npm run sign
npm run download-signed
```

`npm run env:use:local` produces a plaintext `.env` which is already listed in `.gitignore`.

## Obtaining AMO API credentials

If you want to test the signing flow or produce signed XPIs for personal use of your own fork:

1. Visit https://addons.mozilla.org/developers/addon/api/key/
2. Create a new credential.
3. Copy the "JWT issuer" (this becomes `AMO_JWT_ISSUER`) and the "JWT secret" (this becomes `AMO_JWT_SECRET`).

These credentials are only useful for signing builds of your own fork. They do not allow publishing this extension on AMO.

Important: even a successfully signed XPI from AMO will still require the two `about:config` flags (`extensions.experiments.enabled` and `xpinstall.signatures.required`) on end-user machines, because the extension uses privileged Experiment APIs to access Zen's internal workspaces and tabs. See the README for details.

## Why AMO publishing is not viable for this extension

The extension declares `experiment_apis` in its manifest (see `wxt.config.ts` and `public/experiment/zenTabs/`). Mozilla intentionally disallows extensions using privileged Experiment APIs from being submitted to addons.mozilla.org. The existing scripts in `scripts/` (including `release.mjs`, `sign.mjs`, and `download-signed.js`) are oriented toward AMO signing and contain TODOs about listing strategy. They are not the primary distribution path for this repository.

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

This is a high-level overview. The primary distribution mechanism is GitHub Releases, not AMO.

1. Update the version in `package.json` (use semver).
2. Run quality gates: `npm run lint:js && npm run format && npm test && npm run lint`.
3. Build and package: `npm run build && npm run zip`.
4. Commit the version bump.
5. Tag (e.g., `git tag v2.0.0`) and push the tag.
6. Create a GitHub Release for the tag and attach the zip produced by `npm run zip` (WXT places it under `web-ext-artifacts/` or a similar location depending on configuration).

The existing `npm run release` script runs the AMO-oriented flow in `scripts/release.mjs`. It is not the primary path for this repo because privileged Experiment APIs cannot be published on AMO.

## Cursor commands

The files under `.cursor/commands/` are Cursor-specific automation helpers for internal development (quick-start, release notes, upgrades). External contributors can ignore them unless they are also using Cursor.

## License and attribution

This project is released under the MIT license. The original work is copyright Anton Dobrovinskiy as per the MIT license from the upstream repository: https://github.com/AntonDobrovinskiy/Zen-Tab-Search.

When contributing, you agree that your contributions will be licensed under the same MIT terms.

## Questions?

Open an issue or start a discussion. Be sure to check the README first for installation and usage details.
