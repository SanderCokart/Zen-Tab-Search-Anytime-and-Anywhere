# SPEC-01 round 2: sounds, filter tabs, accordions, timers dock

Research: `docs/redesign/SPEC01-SOUNDS-ACCORDION.md`. Round 1: `docs/redesign/STRATEGY.md`. Visual target: `docs/redesign/mockup.html` design A.

## 1. Sound effects
- `shared/ui/sound/engine.ts`: the voice table as data, plus `createSoundEngine({ volume })` with `play(voice)`.
  - The AudioContext is created lazily on the first `play()`, which always happens inside a user gesture. It resumes while suspended.
  - It is a silent no-op when `AudioContext` is missing (jsdom) or throws (CSP/Permissions-Policy). Wrap it in try/catch.
- `shared/ui/sound/SoundContext.tsx`: a Preact context with `{ play }` and a no-op default; `useSound()`.
- `display-settings.ts`: add `soundEnabled: boolean (default true)` and `soundVolume: number 0..1 (default 0.4, clamped)`. They live inside `displaySettings`, which is already backed up.
- Settings UI: a checkbox and a volume slider in the display section.
- `SearchShell.tsx`: wraps its children in a SoundProvider (engine memoised; `enabled` and `volume` come from the settings).
- Call sites (only from event handlers, never on re-render or `snapshotChanged`):

| Voice | Where |
|---|---|
| `type` / `type-space` / `type-up` | SearchInput keydown/keyup |
| `down` / `up` | key buttons |
| `latch-down` / `latch-up` | todo toggle, status latch |
| `tick` | Segmented change, accordion toggle, arrow-key move |
| `open` | context menu, status menu, timer form |
| `success` | timer set |
| `error` | load error |

## 2. Issues & requests filter: All / Issues / MRs
- `features/forge/model/forge-filter.ts`:
  - `type ForgeKindFilter = "all" | "issues" | "requests"`
  - `filterForgeEntriesByKind(entries, filter)`
  - `countForgeEntriesByKind(entries)` returns `{ all, issues, requests }`.
- `Segmented.tsx`: optional `count` per option (`.zs-digits`), a `tick` sound on change, and arrow keys inside the radiogroup.
- `useSearchResults.ts`: apply the filter before `flattenForgeNavigatorEntries`, so the keyboard order contains only visible items. Counts are computed from the pre-filter entries. The current entry is hidden when it doesn't match.
- SearchApp:
  - Holds `forgeKindFilter` for the session and resets `selectedForgeIndex` to 0 when it changes.
  - Renders the Segmented under the navigator header.
  - The third option reads "PRs" when every entry is GitHub, otherwise "MRs".

## 3. Collapsible accordions (project → Issues → MRs → <target branch>)
- `features/forge/model/forge-collapse.ts`:
  - Keys: `project:<platform>:<label>`, `issues:<platform>:<label>`, `branch:<platform>:<label>:<target|?>`.
  - Functions: `forgeGroupKeys(group)` and `visibleForgeEntries(...)`.
  - `flattenForgeNavigatorEntries(entries, sort, current, collapsed?)` skips collapsed subtrees. If the set is omitted, everything is open, so existing tests still pass.
- Persistence: storage.local key `forgeCollapsedGroups` (string array, valibot schema, capped at about 200). It is NOT in `BACKED_UP_STORAGE_KEYS`, because it is disposable UI state.
  - Hook: `features/forge/ui/useForgeCollapse.ts` reads it, writes it and subscribes to changes.
- `shared/ui/primitives/Accordion.tsx`:
  - The trigger is an `aria-expanded` button with a row number (CSS counter), an uppercase label, an `Led` that is lit when open, and a count shown when collapsed.
  - The panel is a recessed `.zs-tray`. Its height animates over 280 ms with `cubic-bezier(.3,.9,.3,1)` using `grid-template-rows: 0fr→1fr` (no px). `prefers-reduced-motion` turns the transition off.
  - Keep `data-testid="zen-issue-folder"` on the folder wrapper.
- Keyboard, only when `activePane === "forge"` (first check that Left/Right are not already bound):
  - Left/Right on the selected entry collapse/expand its innermost group; Left on a collapsed group collapses its parent. Space/Enter on a focused header toggles it.
  - After a collapse, clamp the selection so it stays in range.
- Tick sound on toggle.

## 4. Timers dock under Todos
- The overlay's right column becomes a flex column:
  - TodoNavigator gets `max-h-[50%]` and scrolls internally (`zen-scroll`), so it never pushes the Timers below the fold.
  - Under it, `features/timers/ui/TimersDock.tsx`: a "04 TIMERS" card. It shows an `Lcd` readout of the soonest timer (`TimerCountdown`) and the list.
  - The list is extracted from ActiveTimersPanel into `features/timers/ui/ActiveTimersList.tsx` and shared by both.
  - Data comes from the existing `timers` map and `timerActions`, with no new messaging.
  - The column renders when there are todos or timers.
- Decision: keep the existing `showTimers` drawer as it is (no behaviour removed). The dock is in addition.

## Tests
- Unit tests:
  - Sound engine: the voice table is well-formed, it is a silent no-op without AudioContext, and volume is clamped.
  - `forge-filter`: counts and filtering.
  - `forge-collapse`: flatten skips collapsed project / issues / branch groups and keeps the current entry.
  - `display-settings`: the new fields fall back to their defaults.
- SearchApp.test.tsx:
  - Clicking "Issues" leaves only issue entries, and the counts render.
  - ArrowDown never selects a hidden MR.
  - Collapsing a branch header hides its entries, shows the count, and ArrowDown skips them.
  - Left/Right toggle groups.
  - The collapsed state is written to the storage mock.
  - The dock shows the soonest timer and stays rendered with 30 todos.
  - With sound off, `play` is never called.
- Risks:
  - Existing tests on the `zen-issue-folder` count, the "Issues and requests" text and the entry order may need updating.
  - Assert `aria-expanded` and `hidden`/`inert`, not computed height.

## Constraints
- Do not stage, commit, reset, stash or revert anything.
- Edit the pre-existing uncommitted work (ranking.ts, ForgeIssueNavigator.tsx, protocol.ts, etc.) in place.
- Follow the AGENTS.md layering: `shared/` must not import from `features/`.
- No literal px in the search UI.

## Order of work
1. Model files and their tests.
2. Settings fields and the settings UI.
3. Sound engine, context and provider.
4. Segmented counts and the filter.
5. Accordion primitive, CSS, collapse hook and keyboard.
6. Timers dock and the column layout.
7. Sound call sites.
8. SearchApp tests, then `npm run check`.
