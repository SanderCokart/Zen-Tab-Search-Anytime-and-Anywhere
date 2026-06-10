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
        description: "Open tab search omnibar",
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
        strict_min_version: "78.0",
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
