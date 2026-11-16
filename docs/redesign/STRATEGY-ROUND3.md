# Round 3: current-tab strip, host-overrides toggle, timer icon

## Requests
1. Show the current tab in a full-width strip below the search bar and above the three columns.
2. The ⇄ host-overrides toolbar button behaves like the timer button. It is a toggle (`aria-pressed` + red LED) that opens and closes its view.
3. Remove the "Back to search" buttons from the timers and host-overrides views.
4. The timer toolbar button no longer swaps its icon to an X when open. The LED shows the state.

## Today
- **Toolbar** (`SearchApp.tsx` around 363–428):
  - Timer button: `toggleTimers` switches the overlay to `view: {kind:"timers"}`; the popup uses `showTimers` with `ActiveTimersPanel`. It renders `<TimerIcon close={timersOpen}>` and an LED, with no `aria-pressed`.
  - ⇄ button: `openHostOverrides(currentTabId)` sets `view: {kind:"hosts"}` in the overlay; the popup sends `openHostOverridesPopup`.
- **Back button:** `OmnibarViewPanel.tsx` holds "← Back to search" (`onBack`) for the timers, timer and hosts views.
- **Current tab** appears in three places:
  - The forge "Current tab" section in `ForgeIssueNavigator.tsx` (`zen-current-issue`), pinned at index 0 of `navigatorEntries` via `currentForgeEntry` (`useSearchResults.ts`).
  - The tab list: `prioritizeCurrentTab` puts it first and labels it "· Current tab" (`TabSearchRow.tsx`).
  - The same label in `TodoNavigator.tsx`.

## Decisions (made by the main session)
- **Popup layout:** the ⇄ button keeps its current behaviour there (it sends `openHostOverridesPopup`, with no pressed state). The toggle applies to the overlay layout. The strip renders in both layouts; in the popup it is one compact line.
- **Tab list:** remove `prioritizeCurrentTab` and the "· Current tab" suffix. The active tab stays in the list and ranks normally, so it can still be found by searching. Drop the suffix in TodoNavigator too.
- **Arrow keys:** the strip is not in the arrow-key order and is not an `option`. Its action keys are real buttons, reachable by mouse and Tab.
- **Escape:** behaviour is unchanged.
- **The single-tab `timer` view** (timer form) has no toolbar toggle. It keeps closing through its own Set/Cancel and through typing in the search box. Keep `onBack` wired as the form's `onClose`; only the visible Back button goes.

## Changes, in order
1. **New `features/search/ui/components/CurrentTabStrip.tsx`** (`data-testid="zen-current-tab"`):
   - Shows the favicon, title and space (or hostname).
   - When the tab has a forge entry, it shows that entry's tag, ref and title (via `forgeRowParts`) instead of the plain title, plus a `TimerCountdown` when a timer is set.
   - Reuses `TabActions` for the todo, timer and status keys, and opens the context menu on right-click.
   - Styled as a SPEC-01 `.zs-card` row, using size tokens only.
2. **`useSearchResults.ts`:**
   - Stop pinning the current forge entry into `navigatorEntries`.
   - Expose `currentTab` and `currentTabForgeEntry`, not filtered by kind.
   - Keep the current issue out of the navigator's grouped list.
   - Drop `prioritizeCurrentTab`.
3. **`ForgeIssueNavigator.tsx`:**
   - Remove the `currentEntry` prop and the "Current tab" section.
   - Remove the matching offset in SearchApp's forge group-key handling.
   - Remove the `currentEntry` argument from `flattenForgeNavigatorEntries` and simplify the model and its tests.
4. **`TabSearchRow.tsx` and `TodoNavigator.tsx`:** remove the "· Current tab" suffix.
5. **`SearchApp.tsx`:**
   - Render the strip between the toolbar row and the columns. Hide it while a `timer` or `hosts` view replaces the columns.
   - Overlay ⇄ button: toggles `view` between `{kind:"hosts", tabId: currentTabId}` and none. It has `aria-pressed`, a `<Led on>` and the title "Host overrides for this tab". It shows pressed only when `view.kind === "hosts"` and `view.tabId === currentTabId`.
   - The context-menu "Host overrides…" still targets the clicked tab.
   - Timer button: add `aria-pressed={timersOpen}` and stop passing `close` to `TimerIcon`. Remove the `close` prop if nothing else uses it; the row timer key in TabActions does use it, so keep the prop there.
6. **`OmnibarViewPanel.tsx`:** remove the Back button. Keep the "Click a timer…" hint for the timers view.

## Tests (`SearchApp.test.tsx`)
- **Update:**
  - The Escape-from-view test: wait on view content instead of "Back to search".
  - The context-menu hosts test: close with the ⇄ toggle or by typing.
  - The `zen-current-issue` tests: move them to `zen-current-tab`. The current issue is no longer among the `zen-issue-entry` items, and a query no longer removes the strip.
  - The todo "Current tab" text test.
  - Tests that assume the active tab comes first.
- **Add:**
  - The strip shows the forge tag, ref and countdown for an active issue tab, and its todo and timer keys work.
  - ArrowDown from the input selects the first tab, not the strip.
  - The ⇄ toggle opens and closes, with `aria-pressed`.
  - The timer button keeps the same icon when open and gains `aria-pressed`.
  - No "Back to search" text renders anywhere.
  - The popup layout renders the strip.

## Constraints
- Never stage, commit, reset, stash, checkout or revert. The branch has lots of uncommitted work; edit in place.
- Follow AGENTS.md: layering, `@/` imports, no literal px, size tokens.
- Grep `tests/` and `screenshots/` for `zen-current-issue` and update them.
- Finish with `npm run check` passing and prettier on changed files.
