# SPEC-01 re-skin strategy (branch feat/spec01-redesign)

Visual target: `docs/redesign/mockup.html` design A (`.d-a` light, `.d-a.t-dark` dark), rendered in `docs/redesign/1-spec01-hardware.png`.
Source theme: github.com/shuding/spec-01 (MIT). Font: IBM Plex Mono (OFL) via `@fontsource/ibm-plex-mono`.

## Known SPEC-01 values
Radii: cards 18px, LCD fields 12px, keys 10px, segmented 10px. Key rest shadow `inset 0 1px 0 rgb(255 255 255/.95), 0 3px 0 var(--key-edge)`, pressed = translateY 2px. Well `inset 0 1px 3px rgb(0 0 0/.1), inset 0 0 0 1px rgb(0 0 0/.03)`. LED 5px, off #cfcdc7, on red with glow. Labels uppercase mono, letter-spacing .08–.16em. SPEC-01 has no dark mode; ours comes from the mockup `.t-dark` block.

## 1. Theming
- Keep the `@theme` `--color-zen-*` names but point them at runtime vars (`@theme inline`, e.g. `--color-zen-bg: var(--zs-chassis)`). New semantic tokens: chassis, card, card-hi, ink-1/2/3, hair, lcd, lcd-ink, key, key-edge, pressed, red, red-glow, led-off; shadows `--zs-shadow`, `--zs-key-shadow`, `--zs-well`; radii `--zs-r-card/lcd/key/seg` as multiples of `--zen-font-size` (no literal px).
- Tokens live on `[data-zen-ui]` (light), overridden by `[data-zen-ui][data-theme="dark"]`. Not `:root` — the content script is in a shadow root.
- Display settings: add `theme: "system" | "light" | "dark"` (valibot `v.fallback` picklist, default `"system"`). A hook resolves `system` via `matchMedia("(prefers-color-scheme: dark)")` and sets `data-theme` + `color-scheme` beside `uiScaleStyle()`. `displaySettings` is already in `BACKED_UP_STORAGE_KEYS`.
- User colour overrides (`textColor`, issue/folder/space backgrounds) default to dark hexes and would break light mode: make their default "auto" (theme token), apply a stored hex only when set, and migrate stored values equal to the old dark defaults back to auto.

## 2. Ordered changes
1. [SCAFFOLD] `npm i @fontsource/ibm-plex-mono`; `shared/ui/fonts.css` imports latin 400/500/600 woff2 only.
2. [SCAFFOLD] Create empty files: `shared/ui/fonts.css`, `shared/ui/theme.ts`, `shared/ui/primitives/{Keycap,Led,Lcd,SectionHeader,Segmented}.tsx`.
3. [CODE] `shared/ui/styles.css`: token layer, light/dark blocks, `--font-mono`, radius tokens, utility classes `.zs-card`, `.zs-key` (`:active` / `[aria-pressed=true]` translate), `.zs-well`, `.zs-lcd`, `.zs-led[data-on]`, `.zs-label`. The file already has uncommitted changes — edit additively.
4. [CODE] `features/settings/model/display-settings.ts` + test: theme field, colour defaults → auto. System/Light/Dark segmented control in `DisplaySettingsApp.tsx`.
5. [CODE] Theme hook applied in SearchShell, popup, options, timer-popup and content-script roots.
6. [CODE] Re-skin components (section 3).
7. [SCAFFOLD] Screenshots harness captures light + dark; regenerate.

## 3. Component mapping
- SearchInput: black LCD well, red uppercase "SEARCH" label, lcd-ink text in both themes.
- TabActions/TooltipButton: keycaps; toggles get a 5px LED.
- SearchResultsList: numbered mono section headers ("01 TABS") + hairline; number from render order.
- TabSearchRow: current/selected row pressed (well + red LED); others flat.
- PrefixHint / OmnibarViewPanel: segmented control, active segment pressed.
- ActiveTimersPanel/TimerIcon: LCD countdown, tabular mono digits.
- StatusBar: uppercase label/value readouts; Install = red keycap.
- ForgeIssueNavigator, todos, TabContextMenu, RenameTabDialog: card surface + keycaps only. ForgeIssueNavigator has uncommitted changes — class-only edits, never revert/reformat.
- SearchShell: chassis background with radial highlight; panels `.zs-card`.

## 4. Scope guard
Do not change: keyboard handling, ranking, messaging protocol schemas, storage keys (beyond the new display field), `data-testid`, data attributes, `aria-*`, or visible strings tests assert ("Mark as done" etc.). Never stage, reset or revert the existing uncommitted forge/protocol/search work. `@font-face` inside a shadow root is ignored by Firefox — inject the font-face into the page document once from the content script (extension-URL asset, check `web_accessible_resources`). Check `--ink-3` vs `--card` contrast in light mode.

## 5. Verification
`npm run check`; `npm run build` and confirm woff2 in `.output/*/assets` with no network font fetch; regenerate screenshots in light and dark; manual Zen smoke test (overlay font, popup/options, System follows OS, backup round-trip).
