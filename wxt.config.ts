import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

const zipLabel = process.env.ZIP_ARTIFACT_LABEL?.trim() || "demo";

export default defineConfig({
  srcDir: ".",
  outDir: ".output",
  browser: "firefox",
  zip: {
    artifactTemplate: `{{name}}-${zipLabel}-{{browser}}.zip`,
    sourcesTemplate: `{{name}}-${zipLabel}-sources.zip`,
  },
  manifest: {
    name: "Zen Tab Search",
    description: "Fuzzy search for tabs in Zen Browser with a modern omnibar overlay",
    permissions: [
      "tabs",
      "<all_urls>",
      "alarms",
      "notifications",
      "storage",
      "sessions",
      "contextMenus",
    ],
    commands: {
      "show-omnibar": {
        suggested_key: {
          default: "Ctrl+Shift+F",
          mac: "MacCtrl+Shift+F",
        },
        description: "Open tab search omnibar (in-page overlay when possible)",
      },
      // Custom command so the background script can toggle the popup closed when pressed again.
      // (_execute_browser_action is handled by the browser and cannot be intercepted.)
      "toggle-popup": {
        suggested_key: {
          default: "Ctrl+Alt+F",
          mac: "MacCtrl+Alt+F",
        },
        description: "Open Zen Tab Search popup",
      },
      "change-tab-label": {
        suggested_key: {
          default: "Ctrl+Alt+R",
          mac: "MacCtrl+Alt+R",
        },
        description: "Change Zen label of the selected/open tab",
      },
      "set-tab-timer": {
        suggested_key: {
          default: "Ctrl+Alt+T",
          mac: "MacCtrl+Alt+T",
        },
        description: "Set a timer on the current tab",
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
  // WXT has no official Preact module; this is the documented Vite-plugin path.
  vite: () => ({
    plugins: [preact({ reactAliasesEnabled: false }), tailwindcss()],
  }),
});
