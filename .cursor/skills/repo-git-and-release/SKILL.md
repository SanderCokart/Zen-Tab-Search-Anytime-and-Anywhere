---
name: repo-git-and-release
description: Always apply. Enforces LF line endings, Windows format:check diagnosis, merge into main, GitHub release flags, and branch cleanup anti-patterns for this Firefox extension repo.
---

# Git, format, and release

## Line endings

This repo is LF-only: `.gitattributes` (`* text=auto eol=lf`), Prettier `endOfLine: "lf"`, `.editorconfig`, and `.vscode/settings.json` (`files.eol: \n`). Do not set `git config` (`core.autocrlf`). Do not switch Prettier to `endOfLine: "auto"`.

If `format:check` fails on many files, inspect bytes on one small file. Do not `npm run format` the whole tree, `git add --renormalize`, or `git ls-files | xargs rm`.

## Release notes

Do not invent flags. Read `scripts/release.mjs` usage. Default: `npm run release -- <bump> --generate-notes`. Use `--message` or `--notes-file` only when the user provided notes. Pass `--canary` when the user asked for a canary or prerelease; that marks the GitHub release as a prerelease and leaves Latest unchanged. Do not create a throwaway `RELEASE.md`.

## Merge and branch cleanup

If the user asked to merge into main or delete remote branches, run that on the first attempt and request smart-mode approval immediately. Do not weaken the command.

Cleanup: `git branch --merged main` then `git branch -d` and matching `git push origin --delete`. List `--no-merged` before `-D`.
