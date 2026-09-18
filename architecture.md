# The architecture of Zen Tab Search

A guide for contributors. `CLAUDE.md` is the short reference card; this is the long
version, told as a story — what the extension is trying to do, why the code is
shaped the way it is, and what happens when you add to it.

---

## 1. The problem that shapes everything

Zen Browser is a Firefox fork with **spaces** (workspaces), **folders**, **essential
tabs** and **custom tab labels**. None of that exists in the WebExtension API. If you
call `browser.tabs.query({})` in Zen, you get the tabs of the current window and
nothing else: no space membership, no folder, no custom label, and — crucially —
none of the tabs sitting in the *other* spaces, because Zen keeps them out of the
regular tab model.

So a tab search extension for Zen cannot be built on `browser.tabs` alone. It needs
to reach inside the browser's own chrome code. That is what a **Firefox experiment
API** is: a privileged chunk of JavaScript that runs in the parent process with
access to `gZenWorkspaces` and `gBrowser`, exposed back to the extension as
`browser.zenTabs.*`.

Three consequences fall out of that single fact, and they explain most of the
repository:

1. **Only the background script can see the real tab list.** The popup, the in-page
   overlay and the options page all have to *ask* it. Hence a message protocol with
   validated schemas rather than direct API calls.
2. **The extension can never be installed from addons.mozilla.org.** Privileged
   manifest fields are not allowed there. It is a sideloaded/self-hosted add-on, and
   the linter is configured to tolerate exactly that one complaint.
3. **Everything privileged must be funnelled through one adapter**, because the API
   might be missing (a plain Firefox, a broken build, a race at startup) and every
   call site would otherwise need its own fallback.

Keep those three in mind and the rest of the codebase reads as the obvious response.

---

## 2. The map

Code is organised by **feature**, not by technical layer. Dependencies flow strictly
in one direction:

```
entrypoints/   the browser's four doors into the extension
     │
     ▼
app/           background wiring that belongs to no single feature
     │
     ▼
features/      search · timers · forge · settings · zen
     │
     ▼
shared/        wire protocol, domain types, logging, cn, global styles
```

ESLint enforces the arrows (`no-restricted-imports` in [eslint.config.js](eslint.config.js)).
`shared/` may not import from `features/`, `app/` or `entrypoints/`. `features/` may
not import from `app/` or `entrypoints/`. When one of those rules fires, the fix is
almost always to move the code, not to add an exemption — every violation found so
far was a genuine misplacement.

Features *may* import from each other, and two do: `search` uses the forge model to
recognise issue tabs, and the search UI uses the timers model to format countdowns.
That is allowed and deliberate. The rule that matters is that nothing below reaches
upward.

Inside a feature:

```
features/<name>/
  model/        pure logic. No browser APIs. Trivially unit-testable.
  background/   code that only runs in the background script
  ui/           Preact
    components/   presentational
    hooks/        stateful
    lib/          formatters, class recipes
```

Not every feature needs every folder. `zen/` is flat, because it is one adapter and
its helpers rather than a user-facing feature.

Imports always use the `@/` alias, which points at the repo root:

```ts
import { formatTimerCountdown } from "@/features/timers/model/timer";
```

Never `../../`. Moving a file should not rewrite its neighbours.

Tests sit next to the code they test, named `*.test.ts(x)`. Vitest finds them
anywhere under `app/`, `features/`, `shared/` and `tests/`.

---

## 3. The four doors

[entrypoints/](entrypoints) holds everything the browser itself loads. WXT turns each
one into a bundle and a manifest entry. They are deliberately thin — a door, not a
room.

| Entry point | What it is |
| --- | --- |
| [background.ts](entrypoints/background.ts) | The long-lived script. The only place with Zen access. |
| [popup/](entrypoints/popup) | The toolbar popup. Renders `SearchApp` in `layout="popup"`. |
| [options/](entrypoints/options) | The settings page. Renders `DisplaySettingsApp`. |
| [timer-popup/](entrypoints/timer-popup) | A small window for setting a timer on one tab. |
| [zen-tab-search.content/](entrypoints/zen-tab-search.content) | Content script on `<all_urls>`. Renders `SearchApp` in `layout="overlay"`. |

Three of them are three lines of wiring:

```tsx
render(<SearchApp onClose={() => window.close()} layout="popup" />, root);
```

The interesting two are the background script and the content script.

### The background script is a composition root

[entrypoints/background.ts](entrypoints/background.ts) reads top to bottom as an
assembly manual and contains almost no logic of its own. It:

1. Builds the Zen adapter.
2. Derives the tab query and tab switcher from it.
3. Builds the timer service, handing it *just* the two capabilities it needs
   (`setLabel`, `getCustomTabLabels`) rather than the whole adapter.
4. Builds the snapshot reader from the query, the spaces lookup, the timer list and
   the last-opened store.
5. Registers listeners: context menus, popup tracking, keyboard commands, snapshot
   change notifications, last-opened tracking.
6. Wires alarms, notifications and tab lifecycle events to the timer service.
7. Hands the message router a flat object of handlers.

This is dependency injection by hand, and it is why the pieces are testable: the
timer service never touches `browser.zenTabs`, it receives two functions. The
snapshot reader never touches anything, it receives four.

When you add a feature that needs background behaviour, this file is where it gets
plugged in — and it should stay a wiring file. Logic belongs in the feature.

### The content script is a shadow-DOM overlay

[zen-tab-search.content/index.tsx](entrypoints/zen-tab-search.content/index.tsx) runs
on every page and does nothing until told to. On command it mounts `SearchApp` into
a `createShadowRootUi` container, set to `position: modal` with a very high
`z-index` and promoted to the top layer via the Popover API
(`shadowHost.showPopover()`). Shadow DOM keeps the page's CSS out; `isolateEvents`
keeps the page's event handlers from stealing keystrokes; the top layer keeps the
page from stacking anything above it.

It also owns `collectForgePageInfo()`, which scrapes the title and body of a GitLab
or GitHub page from a list of known selectors. That is the only DOM-scraping code in
the repo, and it lives here because it is the only context that can see the page.

---

## 4. A keystroke, end to end

Follow `Ctrl+Shift+F` — "open the omnibar" — all the way through. This single path
touches most of the architecture.

**1. The manifest.** [wxt.config.ts](wxt.config.ts) declares four commands with
suggested keys. Firefox allows only four, and all four are spent
(`show-omnibar`, `toggle-popup`, `change-tab-label`, `set-tab-timer`). This is why
WXT's own dev-reload shortcut is disabled with `dev.reloadCommand: false` — it
wanted a fifth.

**2. The command listener.** [app/background/commands.ts](app/background/commands.ts)
receives `"show-omnibar"` and calls `toggleOmnibar()`. This file is in `app/` rather
than a feature because it dispatches to four different features.

**3. Choosing a surface.** [features/search/background/omnibar.ts](features/search/background/omnibar.ts)
finds the active tab and asks: can a content script live here? `about:`,
`moz-extension:` and friends are excluded by
[shared/urls.ts](shared/urls.ts). If the page is injectable, it sends a
`toggleOmnibar` command to the tab. If that throws — no content script, page still
loading — it **falls back to the toolbar popup**.

**4. Opening the popup, if it came to that.**
[features/search/background/popup.ts](features/search/background/popup.ts) tries
`browserAction.openPopup()`, and if that is unavailable creates a real 400×480 popup
window instead, remembering its id so a second keypress can close it. This
"try the nice thing, fall back to the blunt thing, remember what you did" pattern
recurs throughout the background code.

**5. The overlay mounts.** The content script builds the shadow root and renders
`SearchApp`.

**6. The UI asks for data.** `SearchApp` calls `useSearchSnapshot()`, which sends
`{ type: "getSnapshot" }`.

**7. The router validates.** [app/background/message-router.ts](app/background/message-router.ts)
parses the raw message against the valibot request union. Unknown type → `{ handled: false }`,
so other listeners get a chance. Known type but malformed → a structured error. Valid →
dispatched to the handler the background script supplied.

**8. The snapshot is assembled.** [features/search/background/snapshot.ts](features/search/background/snapshot.ts)
runs four reads in parallel — tabs, spaces, timers, last-opened timestamps — and
merges the last-opened data into the tabs before returning.

**9. Zen is consulted.** The tab query goes through the adapter, which calls
`browser.zenTabs.getAllTabs()` and falls back to `browser.tabs.query()` if the API
is missing or throws.

**10. The response is validated again**, on the way back, by `parseExtensionSuccess`
in the client. Both directions are checked.

**11. The UI renders**, and `useSearchNavigation` focuses the input 100 ms later,
after the overlay has settled.

---

## 5. How data stays fresh

There is no push of tab data. The rule is: **the background says "something
changed", the UI re-asks.**

`registerSnapshotChangeNotifications()` subscribes to `tabs.onCreated`,
`onRemoved`, `onUpdated`, `onActivated`, `onMoved` and relevant `storage.onChanged`
keys, debounces them by 150 ms, and broadcasts a single `snapshotChanged` message.
Every open surface has a `subscribeToSnapshotChanged` listener that simply re-fetches.

This is less efficient than diffing and vastly simpler, and it is correct by
construction: there is one code path that produces a snapshot, so the UI can never
drift from the background's view of the world.

The background also broadcasts after its own writes — renaming a tab calls
`notifySnapshotChanged()` explicitly, because a label change is not a tab event.

---

## 6. The wire protocol, and where types come from

[shared/messaging/protocol.ts](shared/messaging/protocol.ts) is the contract between
processes, and it is the **single source of truth for the domain types**.

The schemas come first:

```ts
export const tabInfoSchema = v.object({
  id: v.union([v.number(), v.null()]),
  title: v.fallback(v.string(), "Untitled"),
  url: v.fallback(v.string(), ""),
  // …
});
```

The types are inferred from them:

```ts
export type TabInfo = v.InferOutput<typeof tabInfoSchema>;
```

[shared/types.ts](shared/types.ts) re-exports those four types (`TabInfo`,
`SpaceInfo`, `TabTimer`, `FolderInfo`) and adds the predicates that go with them —
`isUsableTabId`, `tabBrowserId`, `isEssentialTab`, `canRenameTab`,
`isActivatableTab`, `formatTabDisplayTitle`.

**To add a field to `TabInfo`, add it to `tabInfoSchema`.** The type follows. Never
hand-write an interface that mirrors a schema — that was the previous arrangement and
the two halves drifted.

Note the `v.fallback()` calls. Data coming back from privileged chrome code is not
guaranteed well-formed, so the schema repairs what it can instead of throwing: a tab
with no title becomes `"Untitled"` rather than an exception in the search UI.

Requests are a discriminated union (`extensionRequestSchema`), and responses are
keyed by request type in `ExtensionSuccessMap`. Because `sendExtensionMessage` is
generic over the request type, this compiles:

```ts
const snapshot = await sendExtensionMessage({ type: "getSnapshot" });
snapshot.tabs; // typed
```

and a typo in the message type, or reading a field that response does not have, is a
compile error rather than a runtime `undefined`.

**Forge domain types** (`ForgeIssueEntry`, `ForgeRef`, `formatForgeKind`, …) live in
[features/forge/model/forge-label.ts](features/forge/model/forge-label.ts), not in
`shared/`. They were in `shared/` once; the boundary lint caught it.

---

## 7. The features

### `zen/` — the privileged adapter

The most important module in the repo is
[features/zen/adapter.ts](features/zen/adapter.ts). Everything that needs Zen goes
through `WorkspaceAdapter`, and **nothing else may call `browser.zenTabs`.**

Two things make it unusual.

**It degrades.** Every method tries the Zen API and falls back to plain `browser.*`.
`listTabs` falls back to `browser.tabs.query`; `activateTab` falls back to focusing
the window and activating the tab. The extension stays usable — with fewer features —
when the experiment API is absent.

**The anchor tab.** Zen's API runs in the parent process and needs to know *which
browser window* you mean. It works that out from a tab id you pass in, the "anchor".
[features/zen/anchor.ts](features/zen/anchor.ts) finds a suitable one, walking a list
of progressively looser queries and skipping extension pages (an extension popup is
not a useful anchor). When nothing works it passes `-1`, which the API accepts as
"guess". If you see `anchorTabId` threaded through a signature, this is why.

The adapter is constructed with injectable seams — `getZenTabsApi`, `browser`,
`resolveAnchorTabId` — purely so [adapter.test.ts](features/zen/adapter.test.ts) can
simulate Zen being present, absent, or broken.

Also in this slice: `tabs-query.ts` and `tabs-switch.ts` (thin shaping over the
adapter) and `tab-last-opened.ts`, which records access times in
`browser.storage.local` because Firefox's own `lastAccessed` does not survive the
things Zen does to tabs.

### `search/` — ranking and the two surfaces

[features/search/model/ranking.ts](features/search/model/ranking.ts) is the largest
pure module and has no browser dependency at all. `fuzzyMatchWithScore` requires
either a substring hit or all query words matching word prefixes *in order*, then
scores: +1000 for a substring, +500 if it starts a word, bonuses for exact and
prefix word matches, and a mild penalty for long strings so short titles win ties.
Around it sit the grouping helpers that turn a flat result list into the folder tree,
space grid and essential-tab grid the UI renders.

Because it is pure, [ranking.test.ts](features/search/model/ranking.test.ts) covers
21 cases with no DOM and no mocks. **This is the payoff of the `model/` convention:
put logic here and testing it is free.**

The UI is one component rendered two ways. `layout="popup"` is the compact toolbar
version; `layout="overlay"` is the full-page version that also shows the issue
navigator. [SearchApp.tsx](features/search/ui/SearchApp.tsx) is an orchestrator that
holds only view state (query, sort mode, which menus are open) and delegates:

| Hook | Owns |
| --- | --- |
| `useSearchSnapshot` | tabs, spaces, timers; the live re-fetch subscription |
| `useDisplaySettings` | settings, synced with the options page |
| `useEssentialTabNames` | extension-local names for essential tabs |
| `useSearchResults` | every derived value: labelled tabs, forge entries, ranking, grouping |
| `useSearchNavigation` | which pane has the keyboard, which row is selected, all key handling |
| `useTimerActions` | timer mutations |
| `useTabRename` | rename dialog state and its two persistence paths |
| `useCloseOnOutsideClick` | generic dismiss-on-outside-pointerdown |

If you are changing search behaviour, you almost certainly want one of these files
rather than `SearchApp.tsx` itself.

`useSearchNavigation` deserves a note, because its logic is genuinely subtle. In the
overlay there are two panes, and the keyboard belongs to one of them. The hook picks
automatically — a query starting with `#` or `!` means the user wants issues, and
otherwise whichever pane has the stronger exact-word match wins. But a `Tab` press or
a click is an explicit override, recorded in `userPane`, and that override outranks
the automatic choice until the query changes again.

### `forge/` — turning URLs into labels

[forge-label.ts](features/forge/model/forge-label.ts) parses GitLab and GitHub URLs
into a `ForgeRef` (platform, kind, host, project path, id), cleans up the page title,
and formats a label like `MR: #123 - !45 - Improve tab search`. Pure and
well-covered.

The background half is [label-command.ts](features/forge/background/label-command.ts),
bound to `Ctrl+Alt+R`. It asks the content script for page info, builds a label, and
writes it via the adapter. On a page that is not an issue or MR, it falls through to
Zen's own native "Change Label" dialog — again, try the good thing, fall back.

The UI half is [ForgeIssueNavigator.tsx](features/forge/ui/ForgeIssueNavigator.tsx),
the right-hand pane of the overlay, grouping entries by platform and project.

### `timers/` — the one with real state

Put a countdown on a tab; the remaining time appears in the tab's Zen label; you get
a notification when it expires. The interesting requirement is that timers survive a
browser restart.

[timer-service.ts](features/timers/background/timer-service.ts) is the most stateful
module in the repo and uses four storage mechanisms at once, each for a reason:

- **`storage.local`** (`tabTimers`) — the durable record.
- **`browser.alarms`** — fires the timer even if the background script was unloaded.
- **`browser.sessions`** tab values — survives a restart *attached to the tab*, which
  is how a restored tab is matched back to its timer when its id has changed.
- **An in-memory `Map`** of last-written label text, to avoid rewriting a label that
  has not changed once per second.

Restoration is genuinely awkward and the code says so: a restored tab may briefly be
`about:blank` with no session data yet, so `scheduleEmptyTabRestoreRetry` retries up
to 50 times at 100 ms intervals. Re-entrancy guards (`restoringTimers`,
`restoreAgain`, `finishingTimerTabs`) exist because restore can be triggered from
several events at once.

The model half, [timer.ts](features/timers/model/timer.ts), is pure: parse a duration
or a date via `@timelang/parse`, compose and strip the `⏱ …` label prefix, cap
durations at 31 days.

### `settings/` — display preferences

[display-settings.ts](features/settings/model/display-settings.ts) holds nineteen
preferences: four booleans for grouping and issue detection, four hex colours, three
that size the UI, two that decide whether tab and issue text is cut to one line, and
six gap sizes. `DisplaySettingsApp` writes them, every surface subscribes
via `storage.onChanged`, so changing a colour or a size updates an open overlay live.

#### The size system

Nothing in the search UI hard-codes a pixel size. Two settings —
`fontSize` (px) and `uiScale` (a unitless density multiplier) — become the custom
properties `--zen-font-size` and `--zen-scale`, and
[shared/ui/styles.css](shared/ui/styles.css) derives every other size from those two
under a `[data-zen-ui]` rule: a type ramp (`--zen-text-xs` … `--zen-text-lg`), a
spacing ramp (`--zen-space-1` … `--zen-space-4`), radii, icon and control sizes, and
the `--zen-tile-space` / `--zen-tile-essential` widths for the two grids at the top of
the results. Components reference the tokens
(`p-[var(--zen-space-2)]`, `text-[length:var(--zen-text-base)]`) and never a literal
size. This replaced a `compact` boolean that every component threaded through to pick
between two hard-coded pixel scales.

Gaps are a second layer on top of that. Six settings — between sections, tabs,
folders, essential tabs, spaces and issues — are picked in pixels in steps of 4 and
stored as a ratio of a 16px reference, so at the default font size the number is the
gap in pixels and it scales with the UI from there. A literal px value would have
stranded the gaps: they would then grow with page zoom while zoom-independent text
stayed put.

**Padding is deliberately not configurable.** It follows `uiScale` alone. An earlier
version exposed a padding multiplier beside each gap, which meant two controls
competing over the same pixels and no way to predict which one to reach for. One
control per gap, one knob for everything inside a row.

`GAP_SETTINGS` in `ui-scale.ts` is the single list tying each setting key to its
custom property; the options page renders a slider per entry and `uiScaleStyle` emits
them, so adding a seventh means touching that list and the CSS, not the UI.

Each gap drives exactly one `gap` or margin in one place, which is what makes the
sliders predictable. Two structural details fall out of that: flat tab results are
wrapped in their own `<ul>` so they take the tab gap rather than the section gap that
separates the blocks around them, and folder sections carry `margin-top` only — with
margin on both sides, adjacent folders would sit two gaps apart.

[ui-scale.ts](features/settings/model/ui-scale.ts) turns the settings into those two
properties, and `SearchShell` puts `data-zen-ui` plus the resulting style on the root
of each surface. Two details are worth knowing before you change it:

- **The derived tokens multiply `--zen-font-size` rather than using `em`.** A custom
  property holding an `em` value resolves against the font size of the element that
  *uses* it, so a token read inside a smaller-text row would silently come out
  smaller. Multiplying a px-valued variable resolves identically everywhere.
- **The unit decides the zoom behaviour; nothing ever queries the zoom factor.** The
  overlay is laid out inside the page, so its CSS pixels scale with page zoom. That
  one fact gives both modes for free: `respectZoom` on emits a plain `px` length and
  the zoom scales it like everything else on the page, while `respectZoom` off emits
  a `min(80vw, 90dvh)`-derived length, and because zoom shrinks the viewport in CSS
  px by exactly the factor it magnifies them, that comes out identical on screen at
  every zoom level.
- **The zoom-independent expression must stay free of any `px` term.** A `px`
  minimum, maximum or offset would scale with zoom and reintroduce the dependence the
  mode exists to remove — an earlier version clamped it between two px bounds and was
  zoom-dependent at the extremes. A test asserts the expression contains no `px`.
- **Neither mode waits on the background.** An earlier version asked for
  `tabs.getZoom()` and divided by it, which meant the overlay painted once at the
  wrong size and visibly snapped when the message resolved. Both sizes are now known
  synchronously and are correct on the first paint.
- **The toolbar popup and options page are browser UI, not page content**, so page
  zoom never touches them and they always take the plain px length.

Like the wire protocol, these are a valibot schema and the type is inferred from it.
The schema differs from the protocol ones in two ways, both because it is reading
storage that a previous version of the extension wrote rather than a message another
part of *this* build just sent:

- **Every field falls back individually**, and the object carries a fallback of its
  own, so the parse cannot throw. One unreadable colour must not cost the user every
  other preference, and storage holding no object at all is an ordinary first run.
- **Numbers are normalised, not just validated.** Each one runs the same clamp the
  options page uses, so a value restored from storage and one just moved on a slider
  end up identical.

The two dependent options — `filterIssuesInOverlay` under `detectForgeIssues`, and
`groupSubfolders` under `groupFolders` — are resolved in a `v.transform` over the
whole object rather than per field. They depend on another field's *normalised*
value, and reading it off the raw input would get it wrong whenever the parent had
itself fallen back.

---

## 8. Adding a feature

Say you want "recently closed tabs".

**1. Make the slice.**

```
features/recent/
  model/recent.ts
  model/recent.test.ts
```

**2. Write the pure logic first.** What is a closed-tab record, how long do you keep
them, how are they ranked. No `browser.*` in this file. Test it — no mocks needed.

**3. Add the wire contract** if the UI needs background data. In
[protocol.ts](shared/messaging/protocol.ts), add a variant to
`extensionRequestSchema`:

```ts
v.object({ type: v.literal("getRecentTabs") }),
```

add `"getRecentTabs"` to `EXTENSION_REQUEST_TYPES`, and add the response type to
`ExtensionSuccessMap`. TypeScript will now tell you every place that must handle it.

**4. Handle it in the router.** Add the method to `MessageRouterHandlers` and a case
in `handleParsedRequest`. The compiler enforces exhaustiveness.

**5. Write the background side** in `features/recent/background/`, taking its
dependencies as arguments rather than importing the adapter directly — that is what
makes it testable.

**6. Wire it up** in [background.ts](entrypoints/background.ts): construct it, pass
the handler into `registerMessageRouter`.

**7. Build the UI** in `features/recent/ui/`. State in `hooks/`, markup in
`components/`. If a piece of state is only interesting to one feature, it stays in
that feature.

**8. Run the gate.**

```bash
npm run check
```

If you need a model of a complete feature, read `features/timers/` — it has a pure
model, a background service, a context menu, a popup and UI, all in one directory.

---

## 9. Testing

116 tests across 17 files, and the distribution is the point:

- **Model tests** dominate and cost nothing — pure functions, no setup.
- **Background service tests** inject fakes for the two or three capabilities the
  service takes.
- **Component tests** render with Preact into happy-dom and assert on the DOM, using
  `data-testid` hooks. [SearchApp.test.tsx](features/search/ui/SearchApp.test.tsx)
  drives 16 cases — typing, arrow keys, pane switching, grouping — entirely through
  a mocked `browser.runtime.sendMessage`.

Those SearchApp tests are the repository's safety net. They pass unmodified across a
refactor that rewrote the component from 1300 lines into a dozen modules, which is
exactly what a behavioural test is for. **Prefer writing tests against behaviour
rather than structure**, so they keep their value when the structure changes.

---

## 10. Build, lint, release

WXT ([wxt.config.ts](wxt.config.ts)) drives the build with `srcDir: "."`, Preact via
the Vite plugin (there is no official WXT Preact module), and Tailwind v4 as a Vite
plugin. Output goes to `.output/firefox-mv2/`.

```bash
npm run dev      # live-reloading dev build
npm run build    # production build
npm run check    # typecheck + eslint + tests — run this before committing
npm run format   # prettier
npm run lint     # builds, then runs the Firefox add-on linter
npm run zip      # packaged artifact
npm run release -- major --notes-file ./RELEASE.md
```

`npm run check` is the gate. The repo is type-clean and lint-clean, so any failure
you see is one you introduced.

[scripts/lint-web-ext.mjs](scripts/lint-web-ext.mjs) wraps `web-ext lint` and allows
exactly one error code, `MANIFEST_FIELD_PRIVILEGED` — the privileged experiment API
from section 1. Everything else fails the build.

[scripts/release.mjs](scripts/release.mjs) owns versioning: it bumps
`package.json`, builds, zips, commits, tags and publishes a GitHub release. **Do not
hand-edit the version.** `scripts/generate-icons.mjs` regenerates icon sizes from
`icon.png` and runs on `postinstall`.

---

## 11. Rules and sharp edges

**Rules**

- Imports use `@/`, never relative paths.
- Dependencies point down: `entrypoints → app → features → shared`.
- Domain types are inferred from valibot schemas, never hand-written twice.
- `browser.zenTabs` is touched only in `features/zen/`.
- Pure logic goes in `model/` with a test beside it.
- `entrypoints/background.ts` is wiring; logic belongs in a feature.

**Sharp edges**

- **Firefox only.** MV2, `browser.*`. There is no Chrome build and there cannot
  easily be one — the whole premise is a Firefox experiment API.
- **Four keyboard shortcuts, all spent.** Adding a fifth means taking one away.
- **`noUncheckedIndexedAccess` is on.** `array[i]` is `T | undefined`. This is
  deliberate; handle it rather than asserting past it.
- **Debug logging is compiled out** unless `WXT_DEBUG=true` in `.env.local`. Use
  `debugLog`/`debugWarn`/`debugError` from `shared/debug.ts`, not bare `console.log`.
- **Essential tabs have no writable Zen label**, so their names live in extension
  storage under `essentialTabNames`, keyed by DOM id — which is why renaming has two
  separate code paths in `useTabRename`.
- **Some tabs have no numeric id**, only a Zen `domId`. Always go through
  `tabBrowserId()` / `isActivatableTab()` rather than reading `tab.id` directly.
- **The overlay lives in shadow DOM.** Page CSS will not reach it, and neither will
  `document.querySelector` from the page. Global styles must be imported into the
  shadow root, which is what `cssInjectionMode: "ui"` handles.
