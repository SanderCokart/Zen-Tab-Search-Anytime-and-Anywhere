Upgrade project dependencies to their latest compatible versions. Run commands yourself and fix breakages before finishing.

## Step 1: Baseline

Record current state:

```bash
node -v
npm -v
npm outdated
```

Summarize which packages are behind and by how many major/minor/patch versions.

## Step 2: Upgrade strategy

Default: upgrade all `devDependencies` in `package.json` to latest.

Packages in this project:

- `@eslint/js`
- `@types/chrome`
- `eslint`
- `happy-dom`
- `prettier`
- `sharp`
- `typescript`
- `typescript-eslint`
- `vitest`
- `web-ext`
- `wxt`

Prefer `npm outdated` + targeted updates over blind major bumps when a package is several majors behind.

Use one of:

```bash
# Check latest for each package
npx npm-check-updates

# Upgrade package.json ranges to latest
npx npm-check-updates -u
```

Or update `package.json` manually when a major bump needs a deliberate choice.

## Step 3: Install

```bash
npm install
```

Ensure `package-lock.json` is updated. Regenerated icons from `postinstall` are expected.

## Step 4: Verify

Run the full verification stack:

```bash
npm run lint:js
npm run format:check
npm test
npm run build
npm run lint
```

Fix TypeScript, ESLint, Vitest, WXT, or web-ext issues caused by the upgrades. Keep fixes minimal and scoped to what the upgrade broke.

## Step 5: Breaking-change checklist

Pay extra attention after major bumps:

| Area | What to check |
|------|----------------|
| `wxt` | `wxt.config.ts`, entrypoints, manifest output |
| `eslint` / `typescript-eslint` | `eslint.config.js` flat-config compatibility |
| `vitest` / `happy-dom` | `vitest.config.ts`, DOM test APIs |
| `web-ext` | lint CLI flags and generated extension output |
| `sharp` | `scripts/generate-icons.mjs` |
| `@types/chrome` | Extension API typings in `lib/` and `entrypoints/` |

## Step 6: Report

Return:

- Table of packages upgraded (old → new version)
- Pass/fail for each verification command
- Any code changes made to restore compatibility
- Remaining risks or manual follow-ups

Do not commit unless the user explicitly asks.
