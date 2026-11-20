# Zen Deck — architecture guide

A Firefox/Zen Browser extension (WXT + Preact + Tailwind v4 + valibot) that provides
fuzzy tab search, tab timers and automatic GitLab/GitHub labels.

## Before you commit

```bash
npm run check
```

Runs `tsc --noEmit`, ESLint and the full test suite. All three must pass — the repo
is type-clean and lint-clean, so any error you see is one you introduced.

Other scripts: `npm run dev` (live-reloading dev build), `npm run build`,
`npm run format`, `npm run lint:web-ext` (builds, then runs the Firefox
add-on linter), `npm run mcp:build` (bundles the MCP server to
`mcp/dist/zen-deck-mcp.mjs`), `npm run screenshots` (Playwright captures
of the mocked UI harness into `docs/screenshots/`).

## Layout

Code is organised by **feature**, not by layer. Dependencies point one way:

```
entrypoints/  ->  app/  ->  features/  ->  shared/
```

ESLint enforces this (`no-restricted-imports`). `shared/` may not import from
`features/`, `app/` or `entrypoints/`; `features/` may not import from `app/` or
`entrypoints/`. If a rule fires, move the code rather than adding an exemption —
each violation so far has been a genuine misplacement.

| Directory      | Holds                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| `entrypoints/` | WXT entry points (background, options, timer popup, content script). Thin |
| `app/`         | Background wiring that spans features: message router, command registration      |
| `features/`    | One directory per feature, each owning its whole vertical                        |
| `shared/`      | Wire protocol, domain types, logging, debug, `cn`, global styles                  |
| `mcp/`         | Node MCP server (outside the extension bundle); may import `shared/` only         |

Features: `search`, `timers`, `todos`, `status`, `forge`, `settings`, `zen`, `bridge`,
`hosts`, `intercept`, `updates`.

Inside a feature:

```
features/<name>/
  model/        pure logic, no browser APIs — the easiest part to unit-test
  background/   background-script code (services, popups, context menus)
  ui/           Preact components
    components/ presentational pieces
    hooks/      stateful logic
    lib/        formatting helpers, class recipes
```

Not every feature needs every subdirectory. `zen/` is flat because it is one
adapter over Zen's experiment API.

Imports always use the `@/` alias (→ repo root), never relative paths:

```ts
import { formatTimerCountdown } from "@/features/timers/model/timer";
```

Tests live next to the code they cover as `*.test.ts(x)`. Vitest discovers them
anywhere under `app/`, `features/`, `shared/` and `tests/`.

## Code map: where things are configured

To extend X, start at the file listed for it. Lines marked **⇄** name values that
are stored in two places and must stay in step, because nothing checks them.

| To change…                                         | Edit                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Permissions, keyboard commands, toolbar button, add-on ID | `wxt.config.ts` → `manifest`                                                                                      |
| What a keyboard command or toolbar click does     | `app/background/commands.ts`                                                                                            |
| Keys inside the omnibar                            | `features/search/ui/hooks/useSearchNavigation.ts`, `features/search/ui/components/SearchInput.tsx`                      |
| A privileged experiment API                        | `public/experiment/<name>/{schema.json,api.js}`, registered under `experiment_apis` in `wxt.config.ts`                  |
| A UI ↔ background message                          | `shared/messaging/protocol.ts`, handled in `app/background/message-router.ts`                                           |
| An MCP tool                                        | `mcp/tools.ts` → `bridgeCommandSchema` in `shared/messaging/bridge-protocol.ts` → `features/bridge/background/zen-commands.ts` |
| A user setting                                     | `DEFAULTS` **and** `displaySettingsSchema` in `features/settings/model/display-settings.ts`; its control in `features/settings/ui/DisplaySettingsApp.tsx` |
| A feature behind the Simple → Dev complexity presets | `COMPLEXITY_FLAG_KEYS`, `PRESETS` and `FULLSCREEN_REQUIRED` in `features/settings/model/complexity.ts`; UI in `features/settings/ui/ComplexitySettings.tsx` |
| Slider ranges for font size, scale and gaps        | `features/settings/model/ui-scale.ts`                                                                                   |
| Theme colours                                      | `THEME_COLOR_KEYS` and `AUTO_SWATCH` in `display-settings.ts`; CSS variables in `features/settings/model/theme-colors.ts` |
| Design tokens (type, spacing, icons, tile widths)  | `shared/ui/styles.css` under `[data-zen-ui]`                                                                            |
| Interface sounds                                   | `SOUND_VOICES` and `VOICE_TABLE` in `shared/ui/sound/engine.ts`                                                         |
| Search ranking                                     | `features/search/model/ranking.ts`                                                                                      |
| GitLab/GitHub URL recognition                      | `parseForgeUrl` in `features/forge/model/forge-label.ts`                                                                |
| A context-menu entry                               | `features/<name>/background/context-menu.ts`, wired in `app/background/context-menus.ts`                                |
| A background listener or service                   | `entrypoints/background.ts`                                                                                             |
| A storage key                                      | A `*_STORAGE_KEY` constant beside the code that owns it (`grep -rn '_KEY = "' features shared`); user settings also go in `BACKED_UP_STORAGE_KEYS` (`features/settings/model/settings-backup.ts`) |
| Which import directions are allowed                | `no-restricted-imports` in `eslint.config.js`                                                                           |
| Shipped fonts **⇄**                                | `FONT_FILES` in `wxt.config.ts`, `shared/ui/fonts.css`, `shared/ui/page-fonts.ts`                                       |
| MCP server asset name **⇄**                        | `MCP_OUTFILE` in `scripts/build-mcp.mjs`, `mcpArtifact` in `scripts/release.mjs`, `MCP_SERVER_FILE_NAME` in `features/bridge/model/mcp-install.ts` (Settings downloads it from the matching release) |
| Release asset name **⇄**                           | `zip.artifactTemplate` in `wxt.config.ts`, the upload in `scripts/release.mjs`, the `-firefox.zip` match in `features/updates/model/release.ts` |
| Release download URL **⇄**                         | `RELEASE_DOWNLOAD_PREFIX` in `features/updates/model/release.ts` and in `public/experiment/zenUpdate/api.js`            |

## Types come from the schemas

`shared/messaging/protocol.ts` defines the valibot schemas for everything crossing
a process boundary, and the domain types are **inferred** from them:

```ts
export type TabInfo = v.InferOutput<typeof tabInfoSchema>;
```

`shared/types.ts` re-exports those plus tab/space helper predicates. To add a field
to `TabInfo`, add it to `tabInfoSchema` — the type follows automatically. Never
hand-write an interface that mirrors a schema.

Forge domain types (`ForgeIssueEntry`, `ForgeRef`, `formatForgeKind`, …) live in
`features/forge/model/forge-label.ts`, not in `shared/`.

## How the pieces talk

The background script is the only thing that can reach Zen's tab API, so every
surface asks it for data.

- **UI → background**: `sendExtensionMessage({ type: "getSnapshot" })` from
  `shared/messaging/client.ts`. The request union and per-type response map live
  in `protocol.ts`; responses are parsed and validated, so a typo in a message
  type is a compile error.
- **background → UI**: the background broadcasts `snapshotChanged`; UIs subscribe
  with `subscribeToSnapshotChanged` and re-fetch. There is no push of data.
- **background → content script**: `sendTabMessage` with a `ContentCommand`.
- **MCP server ↔ background**: the extension dials a loopback WebSocket that
  `mcp/` listens on and authenticates with the token stored under
  `mcpBridgeToken`. Commands are `bridgeCommandSchema` in
  `shared/messaging/bridge-protocol.ts`, validated on both sides, and handled
  in `features/bridge/background/zen-commands.ts`. The bridge stays off until
  the user turns it on in settings.
- **Zen access**: only through `features/zen/adapter.ts`, which falls back to
  `browser.tabs` when the Zen experiment API is unavailable. Do not call
  `browser.zenTabs` anywhere else.
- **Per-tab host overrides** (`features/hosts/`): `proxy.onRequest` sends a tab's
  matching requests to a loopback proxy started by the second experiment,
  `zenHosts` (`public/experiment/zenHosts/`), which tunnels every connection to
  the group's fixed IP. Only `features/hosts/background/host-proxy.ts` calls it.
- **Settings backup** (`features/settings/background/settings-backup.ts`): Firefox
  deletes storage.local on uninstall (including removing a temporary add-on with
  the same ID), so the third experiment, `zenBackup`, mirrors the settings keys to
  `zen-deck-settings.json` in the profile. When storage holds none of them,
  the background restores from that file and reloads the extension. A new storage
  key that is a user setting belongs in `BACKED_UP_STORAGE_KEYS`.
- **Updates** (`features/updates/`): the background asks GitHub for the latest
  release (at startup, every 6 hours, cached under `updateCheck`) and the omnibar
  shows a notice when it is newer. "Install now" goes through the fourth
  experiment, `zenUpdate`, which hands the release zip to Firefox's AddonManager
  as an in-place update. It only accepts assets under this repository's
  `releases/download/` and cancels a package with another add-on ID or version,
  so the `-firefox.zip` asset name `scripts/release.mjs` uploads is load-bearing.
  With `WXT_DEBUG=true` the notice also offers a release that is not newer
  (marked "debug demo"), so a dev build can replace itself to demo the flow.

## Adding a feature

1. Create `features/<name>/` with the subdirectories you need.
2. Put logic you can test without a browser in `model/`, with a `*.test.ts` beside it.
3. If it crosses a process boundary, add the request to `extensionRequestSchema`
   and its response type to `ExtensionSuccessMap` in `protocol.ts`, then handle it
   in `app/background/message-router.ts`.
4. Register any background listeners from `entrypoints/background.ts`.
5. Run `npm run check`.

`features/timers/` is the fullest example: a pure `model/`, a background service,
context menu and popup, and its own UI — all in one directory.

## Gotchas

- **Firefox only.** MV2, `browser.*` namespace. There is no Chrome build.
- **Four keyboard commands maximum.** Firefox allows only four `suggested_key`
  entries. Three are used (Alt+F omnibar, Alt+R rename, Alt+T timer). The toolbar
  button has no popup: its click opens the omnibar. WXT's own reload shortcut is disabled because it
  is Alt+R (`dev.reloadCommand: false` in `wxt.config.ts`).
- **The Zen experiment API is privileged.** `web-ext lint` reports
  `MANIFEST_FIELD_PRIVILEGED`; `scripts/lint-web-ext.mjs` allows that one code
  and nothing else.
- **No hard-coded sizes in the search UI.** `fontSize` and `uiScale` from the display
  settings become `--zen-font-size` and `--zen-scale`, and `shared/ui/styles.css`
  derives the type ramp, spacing ramp, icons and tile widths from them under
  `[data-zen-ui]`. Use the tokens (`p-[var(--zen-space-2)]`,
  `text-[length:var(--zen-text-base)]`), not literal pixels. Any new surface needs
  `data-zen-ui` and `uiScaleStyle()` on its root, or the tokens are undefined and the
  declarations are dropped.
- **`browser.tabs.query` misses tabs in Zen spaces that have not been opened yet.**
  Those tabs have real tab IDs but are left out until the user switches to their
  space. When you need every tab, use `listAllTabs()` from
  `features/zen/tabs-query.ts`, which starts from Zen's own list. Their per-tab
  `browser.sessions` values may not come back either, so timers find their tab
  after a restart by matching two of timer ID, URL and ⏱ label
  (`features/timers/model/timer-match.ts`).
- **Essential tabs have no writable Zen label**, so the extension stores its own
  names under the `essentialTabNames` storage key, keyed by DOM id.
- **`noUncheckedIndexedAccess` is on.** Indexing an array gives `T | undefined`.
- Debug logging is compiled out unless `WXT_DEBUG=true` (see `.env.local`).
w