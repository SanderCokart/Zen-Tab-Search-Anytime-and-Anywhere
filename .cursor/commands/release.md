Prepare and publish a new release of the Zen Tab Search Firefox extension. Run commands yourself unless blocked (e.g. missing AMO credentials).

> **TODO:** Review AMO signing and download flow before first release from this scaffold. See `scripts/sign.mjs`, `download-signed.js`, and `scripts/release.mjs`.

## Step 1: Confirm release scope

Run:

```bash
git status
git log --oneline -10
```

Read `package.json` for the current version. Ask the user for the new version if they did not provide one in the command text.

Use [semver](https://semver.org/): patch for fixes, minor for features, major for breaking changes.

## Step 2: Quality gate

Run all checks and fix failures before continuing:

```bash
npm run lint:js
npm run format:check
npm test
npm run lint
```

`npm run lint` builds first, then runs `web-ext lint` on `.output/firefox-mv2/`.

## Step 3: Bump version

Update `version` in `package.json` only. WXT uses this for the extension manifest.

Do not change unrelated files.

## Step 4: Build

```bash
npm run build
```

Confirm output exists at `.output/firefox-mv2/`.

## Step 5: Sign for Mozilla Add-ons

Requires `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` in decrypted `.env` (via `npm run env:use:local`).

```bash
npm run sign
```

This runs build, web-ext lint, and submits an unlisted signing request. If credentials are missing, stop and explain the setup from `README.md`.

Signing is asynchronous — Mozilla may take minutes to hours.

## Step 6: Download signed XPI (when ready)

```bash
npm run download-signed
```

- Exit code `2` means still under review — tell the user to retry later.
- On success, the signed file lands in `signed/zen-tab-search-<version>.xpi`.

## Step 7: Git release (only if user asked to commit/tag)

Do not commit unless the user explicitly requests it in this command.

If requested:

1. Stage only release-related files (`package.json`, `package-lock.json` if changed, any intentional release notes).
2. Commit with a clear message, e.g. `chore(release): v1.2.1`
3. Tag: `git tag v<version>`
4. Push branch and tag only if the user asked to push.

## Step 8: Report

Return a concise release summary:

| Item | Value |
|------|-------|
| Old → new version | |
| Quality checks | pass/fail per step |
| Build output | path |
| Sign submission | sent / skipped (why) |
| Signed XPI | path or pending review |
| Install steps | `about:addons` → gear → **Install Add-on From File…** |
