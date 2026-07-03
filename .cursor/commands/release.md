Prepare and publish a new GitHub release of the Zen Tab Search Firefox extension. Run commands yourself unless blocked.

## Step 1: Confirm release scope

Run:

```bash
git status
git log --oneline -10
```

Read `package.json` for the current version. Ask the user for the bump type or exact version if they did not provide one in the command text.

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

## Step 3: Publish release

Use the release helper from a clean working tree. It bumps `package.json` and `package-lock.json`, commits the version files, creates an annotated tag, builds the zip, creates a GitHub Release, and attaches the zip.

```bash
npm run release -- patch --message "Release notes"
npm run release -- minor --notes-file ./RELEASE.md
```

Use `patch`/`bump`, `minor`, `major`, or an exact `x.y.z` version. Release notes must be provided with `--message` or `--notes-file`.

## Step 4: Report

Return a concise release summary:

| Item | Value |
|------|-------|
| Old → new version | |
| Quality checks | pass/fail per step |
| Git tag | |
| GitHub release | URL |
| Attached zip | path |
| Install steps | `about:addons` → gear → **Install Add-on From File…** |
