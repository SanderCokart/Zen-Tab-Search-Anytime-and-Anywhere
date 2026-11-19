---
name: release-notes
description: Write Zen Deck GitHub release notes for a minor or major release (x.y.0) in the house style of 5.0.0, 5.1.0 and 5.2.0. Diffs against the previous release, captures screenshots or GIFs for highlights, and writes docs/releases/vX.Y.Z.md. Use when asked for release notes, a changelog, or before `npm run release -- minor|major`.
---

# Release notes

Source of truth for style: `gh release view v5.0.0|v5.1.0|v5.2.0 --json body -q .body`. `docs/releases/v5.2.0.md` is the checked-in model. Read at least one before writing.

## 1. Gather the changes

```bash
PREV=$(git describe --tags --abbrev=0 --match 'v*' HEAD)   # last release tag
git log --no-merges --pretty='%h %s' $PREV..HEAD
git diff --stat $PREV..HEAD -- features shared app entrypoints mcp public
git diff $PREV..HEAD -- shared/messaging/protocol.ts   # new/removed messages = feature signals
```

- For a minor/major, compare against the previous **minor** (or the last tag the users are on). If patches shipped in between, include their fixes.
- Read the diff, not just commit subjects. Group into: **feature**, **fix**, **cosmetic** (visual change with no new behaviour), **removed**, **MCP**, **upgrade-affecting** (add-on ID change, settings migration, new Zen prefs).
- Check removed settings and storage keys. Users lose things silently otherwise.
- Verify claims in the code. Never write a behaviour you did not see.

## 2. Pick the highlights

5 to 7 items, ordered by user impact. Each is one bold lead phrase plus one sentence. Each highlight gets a section further down that explains it. If a change has no section, it does not belong in Highlights.

## 3. Capture visuals

One visual per highlight, plus one hero image under the Highlights list. Use the mocked UI harness, never the real browser (no personal data, reproducible).

**Screenshots** (fastest, default):
- Add a `Capture` to `screenshots/capture.spec.ts` (scene in `screenshots/scenes.ts`), then `npm run screenshots`.
- Output lands in `docs/screenshots/` (light) and `docs/screenshots/dark/` (dark). Release notes use the **dark** variants. Use `highlight()` in `capture.spec.ts` to outline a control that is hard to find.

**GIF** (when the feature is motion: typing, swapping, tooltips printing, dials, folding). Prefer GIF over MP4, because GitHub release bodies render GIFs inline and do not render `<video>` from repo URLs.
Use `scripts/record-gif.mjs`: add a flow to `FLOWS`, run `node scripts/record-gif.mjs <name>`. It starts the harness, records, trims the blank lead-in and writes `docs/gifs/<name>.gif`. Append `?busy=1` to a scene (the script already does) for a longer demo list of forge tabs and todos. Then check frames:
`ffmpeg -i x.gif -vf "fps=1/1.2,scale=480:-1,tile=3x2" -frames:v 1 sheet.png` and read the sheet.

What the script does, if you need a one-off:
1. Record the harness with Playwright (`recordVideo: { dir, size: { width: 960, height: 600 } }`, dark colour scheme), drive it with real `page.keyboard`/`click` calls and `waitForTimeout` pauses so the result is readable. Aim for 3 to 8 seconds.
2. Convert with ffmpeg (on PATH):

```bash
ffmpeg -y -i in.webm \
  -vf "fps=15,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  -loop 0 docs/gifs/<feature>.gif
```

3. Keep each GIF under about 2 MB. Lower `fps`, width or `max_colors` if larger. Trim dead time with `-ss`/`-t`.
4. Open the GIF or a frame and check it. A GIF that starts on a blank frame or cuts off mid-action is rejected.

Commit images **before** tagging. Notes link to them at the tag (see below), so a missing file is a broken image on the release page.

## 4. Write `docs/releases/vX.Y.Z.md`

Order of sections. Drop a section if empty; do not reorder.

1. **Header block**: centred logo (128px), `<h1 align="center">Zen Deck X.Y</h1>`, centred one-line tagline or two-line bold tagline.
2. **Callouts** only when needed: `> [!IMPORTANT]` for upgrade-breaking news (5.0.0 add-on ID change).
3. **`## Highlights`**: bullet list as in step 2. Hero image after it with an italic caption.
4. **One `##` section per highlight**, in the same order. Each: 1 to 3 short paragraphs of what it does and how to use it, key names in **bold**, shortcuts and literals in `code`, then its image or GIF with an italic caption saying what to look at. Use a two-column table for before/after or two states. Use a comparison table for preset-style matrices.
5. **`## Features`**: every feature in the release, including the highlighted ones, as collapsed entries (below).
6. **`## Bug fixes`**: same entry format.
7. **`## Cosmetic changes`**: same entry format. Visual-only: spacing, shadows, rounding, alignment, key styles.
8. **`## Removed`** (if anything): bullets, each saying what to use instead.
9. **`## For AI agents (MCP)`** when MCP tools changed: count before and after, new tool names in `code`, link to the `zen-deck-mcp.mjs` asset.
10. **`## Install or update`**: "On the previous version: Install now on the update notice" then the `zen-deck-vX.Y.Z-firefox.zip` link and `about:addons` steps, then the MCP asset. Link back to 5.0.0 notes for 4.x.
11. **Footer**: `<sub>Screenshots use demo data.</sub>`. 5.0.0 also has Credits; keep them there.

### Collapsed entry format (Features, Bug fixes, Cosmetic)

```html
<details>
<summary><strong>Lead phrase.</strong> One sentence of what changed for the user.</summary>

Two or three sentences of detail: when it applies, what it replaces, what stays the same.
</details>
```

Rules:
- Use `<code>` inside `<summary>` (markdown does not render there). Markdown is fine in the body.
- The summary alone must be enough to understand the entry. The body is optional extra.
- Fixes say what the user saw and what happens now. "A leftover popup URL could swallow the click. It is cleared." Not "fixed regression".
- Cosmetic is for changes with no new capability. If it adds a capability, it is a feature.
- Lists in 5.0.0 and 5.1.0 used plain bullets for "Also in this release" and "Fixes". 5.2.0 moved to `<details>`. Use `<details>` for new notes.

### Image links

Pin to the tag so images never change under old notes:

```
![Alt text describing the screen](https://raw.githubusercontent.com/SanderCokart/Zen-Deck/vX.Y.Z/docs/screenshots/dark/<file>.png)
```

GIFs: same URL shape with `docs/gifs/<file>.gif`. Alt text says what is shown. Always add the italic caption line beneath.

## 4b. Host a draft preview (required)

The user must be able to read the first draft exactly as it will look on the release page, with every image and GIF loading. A file in the working tree is not a preview. Do this before asking for approval:

1. Commit the notes file and all new images/GIFs, and push the branch (`git push -u origin HEAD`). Images must exist on GitHub to render.
2. Write a preview copy of the body with image URLs pinned to the **pushed commit SHA** instead of the not-yet-existing tag:

```bash
SHA=$(git rev-parse HEAD)
sed "s#/Zen-Deck/vX.Y.Z/#/Zen-Deck/$SHA/#g" docs/releases/vX.Y.Z.md > "$TMPDIR/preview.md"
```

3. Publish it as a **draft** release under a throwaway tag name. A draft does not create a tag, is visible only to repo maintainers, and does not touch Latest:

```bash
gh release create "vX.Y.Z-preview" --draft --target "$SHA" \
  --title "Zen Deck X.Y.0 — <short phrase> (preview)" --notes-file "$TMPDIR/preview.md"
```

4. Give the user the draft URL that `gh` prints. Check it yourself first: `gh release view vX.Y.Z-preview --json body` and confirm each image URL returns 200 (`curl -sI <url>`).
5. Apply the user's edits to `docs/releases/vX.Y.Z.md`, commit, push, and refresh the draft with `gh release edit vX.Y.Z-preview --notes-file ...` (re-run the `sed`).
6. When the user approves, delete the draft (`gh release delete vX.Y.Z-preview --yes`) and run the real release in step 6. Never leave a preview draft behind.

## 5. Voice

Learned from the three releases:

- Title: `Zen Deck X.Y.0 — <short phrase>` (set by `--title`, not in the body).
- Plain, concrete, second person ("Rest on a key and its name prints out"). Name the actual keys, shortcuts and menu labels.
- Short sentences. One idea each. Say what it does before why it matters.
- Compare to the previous version when it clarifies ("5.1 showed every surface at once. That deck is still here.").
- No hype words, no "seamless", "powerful", "leverage", "enhanced experience". No emoji. No filler intros. Em dashes only in the title. Apply the `unslop` skill.
- Say what is *not* changing when users might worry (theme, colours and sound stay put).
- Always give the upgrade path for the person on the previous version.

## 6. Ship

```bash
npm run check
npm run release -- minor --title "<short phrase>" --notes-file docs/releases/vX.Y.Z.md
```

Run `npm run release -- --dry-run` first if unsure. `release.mjs` refuses a dirty working tree, so commit the notes file and images first (the tag then contains them). It tags the version commit, and image URLs resolve at that tag. Do not create a throwaway `RELEASE.md`. Patches use `--generate-notes` per `repo-git-and-release`; this skill is for `x.y.0`.
