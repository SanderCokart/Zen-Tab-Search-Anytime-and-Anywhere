import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: ".",
  outDir: ".output",
  browser: "firefox",
  manifest: {
    name: "Zen Tab Search",
    description: "Fuzzy search for tabs in Zen Browser with a modern omnibar overlay",
    permissions: ["tabs", "<all_urls>"],
    commands: {
      "show-omnibar": {
        suggested_key: {
          default: "Alt+T",
          mac: "MacCtrl+T",
        },
        description: "Open tab search omnibar (in-page overlay when possible)",
      },
      // Special command name: pressing this (or clicking the toolbar icon) opens the popup directly.
      // This works even when there is no normal content tab (e.g. about:newtab, no tabs at all).
      _execute_browser_action: {
        suggested_key: {
          default: "Alt+Shift+T",
          mac: "MacCtrl+Shift+T",
        },
        description: "Open Zen Tab Search popup",
      },
    },
    icons: {
      48: "icon/48.png",
      96: "icon/96.png",
    },
    experiment_apis: {
      zenTabs: {
        schema: "experiment/zenTabs/schema.json",
        parent: {
          scopes: ["addon_parent"],
          paths: [["zenTabs"]],
          script: "experiment/zenTabs/api.js",
        },
      },
    },
    browser_specific_settings: {
      gecko: {
        id: "zen-tab-search@extension.example",
        strict_min_version: "128.0",
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
  },
  webExt: {
    disabled: true,
  },
});
