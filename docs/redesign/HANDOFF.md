# Handoff: SPEC-01 redesign (`feat/spec01-redesign`)

Status as of 2026-11-16. **Nothing is committed.** The branch was cut from `main` (v4.2.0) and carries the earlier uncommitted forge, target-branch and search work as well as the redesign. About 127 files changed or are new.

## Gates

- `npm run check` (tsc, ESLint, vitest) passes: 562 tests in 64 files.
- `npx playwright test -c screenshots/playwright.config.ts` passes 52/52. It writes light screenshots to `docs/screenshots/` and dark ones to `docs/screenshots/dark/`.
- **Nothing has been tried in Zen.** Everything below is verified only in tests and the mocked screenshot harness.

## Working agreement

The user wants the work split by model (see the memory note "Agent model pipeline"):

- Haiku: research and terminal chores.
- Opus at low effort: strategy.
- Sonnet at medium effort: code.
- Main session: orchestration and verification. It runs `npm run check` itself and looks at the screenshots, rather than trusting the agent's report.

Give Sonnet a clear brief that names the files and states the gates.

## What was built

The overall style follows SPEC-01 / Hardware (spec-01.vercel.app, MIT), in light and dark.

### Design files in `docs/redesign/`

| File | What |
| --- | --- |
| `mockup.html`, `1-*.png` … `3-*.png` | Round 1 directions. Design A (SPEC-01 hardware) was chosen. |
| `STRATEGY*.md`, `SPEC01-SOUNDS-ACCORDION.md` | Opus strategy notes for each round. |
| `folders.html`, `folders-*.png` | Forge folder options. Option 3, "Rack tree", was chosen. |
| `settings.html`, `settings-*.png` | Settings options. Option 2, "Module grid", was chosen. |
| `density.html`, `density-calm.png` | The "Calm" density layout, now implemented. |

### Theme and tokens (`shared/ui/styles.css`)

- `--zs-*` colour tokens live on `[data-zen-ui]`, with dark overrides on `[data-zen-ui][data-theme="dark"]`. They are mapped to `--color-zen-*` via `@theme inline`.
- Utility classes: `.zs-card`, `.zs-key`, `.zs-key-mini`, `.zs-well`, `.zs-lcd`, `.zs-led`, `.zs-tree-*`, `.zs-mod-two`, `.zs-dial`, `.zs-row-title`, `.zs-meta`, `.zs-acts`.
- The theme setting is `system | light | dark`, resolved by `useResolvedTheme` (`shared/ui/theme.ts`).
- Fonts are bundled (`@fontsource/ibm-plex-mono`, `@fontsource/inter`) and copied to `fonts/` by `wxt.config.ts`. For the content script's shadow root they are injected into the page (`shared/ui/page-fonts.ts`).

### Calm density (latest round)

**Default sizes.**
- Default `fontSize` is 14 (was 12).
- Type ramp at 14px: 11 / 12 / 13 / 14 / 16, plus a 26px display size.
- Spacing ramp: 4 / 8 / 12 / 16 / 20 / 24.
- Rows are 40px (`--zen-row-height`) with 20px icons.
- Card padding is 20px, column gap 24px, default section gap 20px.
- The popup has a tighter block in `styles.css`: 32px rows and 24px mini keys.

**Overlay sizing.**
- With "Follow the page zoom level" off, the font is now `fontSize / tabZoom` px. It used to be `min(vw, dvh)`, which made the UI balloon on large windows.
- How it works:
  - A new `getTabZoom` request is answered by `browser.tabs.getZoom`.
  - `tabs.onZoomChange` broadcasts `tabZoomChanged`.
  - `features/search/ui/hooks/usePageZoom.ts` listens for it.
  - The maths is in `features/settings/model/ui-scale.ts`.
- No new permission was needed.

**Rows.**
- One line: icon · title · meta pushed right. Titles are Inter 500; meta is mono 11px and never shrinks, so only the title truncates.
- The three row keys (todo, timer, rename) appear only on hover, selection or focus-within. They stay in the DOM.
- A tab with a todo shows a red dot after its title.
- The selected row gets a red bar on its left edge.

**Folders.**
- Folders are numbered sections inside one column card.
- Tabs outside any folder get their own "Tabs" heading.
- Folders and sub-folders collapse with the slim tree toggle. The state is saved in `storage.local` under `tabFolderCollapsed`. Collapse is ignored while a query is active.
- Shared hook: `useStoredCollapse(storageKey)`, in `features/forge/ui/useForgeCollapse.ts`.

**Other surfaces.**
- Current tab: a NOW strip (`CurrentTabStrip.tsx`). In the popup it shows only the title and keys.
- Timers:
  - one large LCD for the next timer, then rows with a short countdown chip;
  - `formatShortCountdown` and `formatLcdCountdown` are in `features/timers/model/timer.ts`.
- Todos: a tinted block with a mono footer (space on the left, MARK AS DONE on the right).

### Earlier rounds, all done

- **Sounds.**
  - Synthesised in Web Audio (`shared/ui/sound/engine.ts`), with one shared engine per document (`SoundContext.tsx`).
  - Key presses go through `key-press-voice.ts`.
  - Elements marked `data-own-sound` play their own sound and are skipped by the generic press listener.
- **Issues and requests navigator.**
  - An All / Issues / MRs filter, and a "Rack tree" grouped by host → project → issues / MRs per target branch, built on the `TreeNode` primitive.
  - Collapse state is saved under `forgeCollapsedGroups`.
  - The old `Accordion.tsx` is kept but unused.
- **Toolbar toggles.** The timers and ⇄ hosts buttons are toggles with an LED. "Back to search" was removed.
- **Settings page ("Module grid").**
  - Primitives in `shared/ui/primitives/`: `Switch`, `Slider`, `Dial`, `Module`.
  - Only Volume has a dial. It uses the Pointer Lock API, which hides the cursor while turning.
  - Links & issues is a two-column switch grid.
- **AUTO colour fix.**
  - The colour picker only saves a colour you actually changed.
  - A theme swatch saved by mistake migrates back to `"auto"` (`isStrayColor` in `display-settings.ts`).

## Known open items

1. **Popup still cramped.** At 380×420 the spaces, essentials and folder headers leave room for about one tab row. Proposed next step: compact spaces and essentials in the popup only (icon-only tiles, a single essentials row, or hiding them in the popup by default). This was the open question to the user.
2. **Not verified in Zen:**
   - zoom detection (whether the omnibar window really has zoom 1);
   - sound playback;
   - pointer lock in the pop-out settings window;
   - the Pickr colour picker;
   - fonts in the shadow root on pages with a strict CSP;
   - Alt+Left/Right being intercepted.
3. **No migration for an old font size.** Users who saved `fontSize: 12` keep 12.
4. **Timer row names truncate** at default sizes, because the chip, Edit and Clear take the room.
5. **The status bar shows V4.0.2** while `package.json` says 4.2.0.
6. **The GitHub "PR: #45 - " title prefix** is not stripped from row titles (`forgeRowParts`). This was offered and not yet requested.
7. **Collapse state is not backed up.** `tabFolderCollapsed` and `forgeCollapsedGroups` are not in `BACKED_UP_STORAGE_KEYS`; this is intentional.
8. **`npm audit`** reports about 40 vulnerabilities, not investigated.
9. **Small behaviour changes:**
   - the popup ⇄ button still opens a separate window;
   - the current tab is no longer pinned first in the tab list.

## To ship

1. Load the build in Zen (`npm run dev`) and check item 2 above.
2. Fix the popup density.
3. Commit using the `git-commit` skill. Consider splitting the commits:
   - the forge, target-branch and search work;
   - the SPEC-01 re-skin;
   - Calm density;
   - the regenerated screenshots.
4. Open a PR against `main` with the `pr` skill.
