---
name: zip
description: Build the Zen Tab Search Firefox extension zip for testing or installation. Use when the user invokes /zip or asks to create, rebuild, or package the extension zip.
disable-model-invocation: true
---

# Zip

Run the package command immediately from the project root:

```bash
npm run zip
```

The command creates:

- `.output/zen-tab-search-<version>-firefox.zip`
- `.output/zen-tab-search-<version>-sources.zip`

Report the Firefox zip path after the command succeeds. Do not bump the version, publish a release, or run unrelated validation unless the user asks.

called '/zip' that does: calls the needed zip command instantly
