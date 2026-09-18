# Zen Tab Search — architecture guide

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
add-on linter).

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
| `entrypoints/` | WXT entry points (background, popup, options, timer popup, content script). Thin |
| `app/`         | Background wiring that spans features: message router, command registration      |
| `features/`    | One directory per feature, each owning its whole vertical                        |
| `shared/`      | Wire protocol, domain types, logging, debug, `cn`, global styles                  |

Features: `search`, `timers`, `forge`, `settings`, `zen`.

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
- **Zen access**: only through `features/zen/adapter.ts`, which falls back to
  `browser.tabs` when the Zen experiment API is unavailable. Do not call
  `browser.zenTabs` anywhere else.

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
  entries and all four are used; WXT's own reload shortcut is disabled for this
  reason (`dev.reloadCommand: false` in `wxt.config.ts`).
- **The Zen experiment API is privileged.** `web-ext lint` reports
  `MANIFEST_FIELD_PRIVILEGED`; `scripts/lint-web-ext.mjs` allows that one code
  and nothing else.
- **Essential tabs have no writable Zen label**, so the extension stores its own
  names under the `essentialTabNames` storage key, keyed by DOM id.
- **`noUncheckedIndexedAccess` is on.** Indexing an array gives `T | undefined`.
- Debug logging is compiled out unless `WXT_DEBUG=true` (see `.env.local`).
