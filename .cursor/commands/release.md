Prepare and publish a new GitHub release of the Zen Tab Search Firefox extension. Run commands yourself unless blocked.

Follow the `repo-git-and-release` skill. Do not rewrite the worktree to fix line endings (`npm run format` on the whole tree, `git add --renormalize`, or deleting checked-out files).

## Step 1: Confirm release scope

Run:

```bash
git status
git log --oneline -10
```

Read `package.json` for the current version.

If the user asked to merge into main (or land the current branch on `main`), do that before the quality gate: `git checkout main`, `git pull`, merge the feature branch. Expect a protected-branch approval. Retry the same merge with `request_smart_mode_approval` and the classifier reason. Do not rewrite the merge into a weaker command.

If the user passed `patch`, `bump`, `minor`, `major`, or `x.y.z`, use it. Otherwise infer from `git log` since the latest tag (features → minor, fixes only → patch, breaking → major). State the inference in one sentence and continue.

Use [semver](https://semver.org/).

## Step 2: Quality gate

Run all checks and fix real failures before continuing:

```bash
npm run lint:js
npm run format:check
npm test
npm run lint
```

`npm run lint` builds first, then runs `web-ext lint` on `.output/firefox-mv2/`.

If `format:check` fails on a large set of files, inspect bytes on one small file. The repo is LF-only (`.gitattributes`, Prettier `endOfLine: "lf"`). Do not mass-format or renormalize during a release. Only format files with real style diffs.

## Step 3: Publish release

The working tree must be clean. The helper bumps `package.json` and `package-lock.json`, commits the version files, creates an annotated tag, builds the zip, creates a GitHub Release, and attaches the zip.

Default when the user did not supply notes:

```bash
npm run release -- minor --generate-notes
```

If they supplied notes, use `--message` or `--notes-file` instead (only one notes source). See `scripts/release.mjs` usage. Do not create a throwaway `RELEASE.md`.

Use `patch`/`bump`, `minor`, `major`, or an exact `x.y.z` version.

## Step 4: Branch cleanup (only if the user asked)

```bash
git branch --merged main
git branch --no-merged main
```

Delete merged local branches with `git branch -d` and matching remotes with `git push origin --delete`. Request smart-mode approval on the first remote-delete. List `--no-merged` branches and only `-D` / remote-delete those after stating they are unmerged.

## Step 5: Report

Return a concise release summary:

| Item | Value |
|------|-------|
| Old → new version | |
| Quality checks | pass/fail per step |
| Git tag | |
| GitHub release | URL |
| Attached zip | path |
| Merged from | branch, or omitted if no merge |
| Deleted branches | list, or omitted if no cleanup |
| Install steps | `about:addons` → gear → **Install Add-on From File…** |
