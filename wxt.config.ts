import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";
// @ts-expect-error - plain .mjs build helper with no type declarations
import { injectExperimentDebugAsset } from "./scripts/experiment-debug.mjs";
// @ts-expect-error - plain .mjs build helper with no type declarations
import { buildMcp, MCP_OUTFILE } from "./scripts/build-mcp.mjs";

// Where the bundled MCP server sits inside the extension. Must match MCP_SERVER_ASSET_PATH
// in features/bridge/model/mcp-install.ts.
const MCP_SERVER_ASSET = "mcp/zen-tab-search-mcp.mjs";

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
        description: "Change Zen labels of the selected tabs",
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
  hooks: {
    "build:publicAssets": async (wxt, files) => {
      injectExperimentDebugAsset(wxt, files);
      // Ship the MCP server with the extension so its settings page can offer the matching build.
      await buildMcp();
      files.push({ relativeDest: MCP_SERVER_ASSET, absoluteSrc: MCP_OUTFILE });
    },
  },
  // Browsers allow only 4 commands with suggested_key; all four are used above.
  // File-watch still rebuilds/reloads; this only skips WXT's Alt+R shortcut.
  dev: {
    reloadCommand: false,
  },
  // WXT has no official Preact module; this is the documented Vite-plugin path.
  vite: () => ({
    envPrefix: ["VITE_", "WXT_"],
    plugins: [preact({ reactAliasesEnabled: false }), tailwindcss()],
  }),
});
