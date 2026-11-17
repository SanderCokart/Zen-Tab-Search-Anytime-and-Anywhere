import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { defineConfig } from "wxt";
// @ts-expect-error - plain .mjs build helper with no type declarations
import { injectExperimentDebugAsset } from "./scripts/experiment-debug.mjs";
// @ts-expect-error - plain .mjs build helper with no type declarations
import { buildMcp, MCP_OUTFILE } from "./scripts/build-mcp.mjs";

// Where the bundled MCP server sits inside the extension. Must match MCP_SERVER_ASSET_PATH
// in features/bridge/model/mcp-install.ts.
const MCP_SERVER_ASSET = "mcp/zen-deck-mcp.mjs";

// The overlay's fonts, shipped as plain files (see shared/ui/page-fonts.ts for why).
const FONT_WEIGHTS = [400, 500, 600];
const FONT_FILES = ["ibm-plex-mono", "inter"];

const zipLabel = process.env.ZIP_ARTIFACT_LABEL?.trim() || "demo";
const zipSources = process.env.ZIP_SOURCES === "false" ? false : undefined;

export default defineConfig({
  srcDir: ".",
  outDir: ".output",
  browser: "firefox",
  zip: {
    artifactTemplate: `{{name}}-${zipLabel}-{{browser}}.zip`,
    sourcesTemplate: `{{name}}-${zipLabel}-sources.zip`,
    ...(zipSources === false ? { zipSources } : {}),
  },
  manifest: {
    name: "Zen Deck",
    description:
      "Control surface for Zen Browser: tab search, spaces, timers, hosts, and AI agents.",
    permissions: [
      "tabs",
      "<all_urls>",
      "alarms",
      "notifications",
      "storage",
      "sessions",
      "contextMenus",
      // Routes a tab's traffic for overridden hostnames to the loopback host proxy.
      "proxy",
    ],
    commands: {
      "show-omnibar": {
        suggested_key: {
          default: "Alt+F",
        },
        description: "Open the Zen Deck omnibar",
      },
      // Custom command so the background script can toggle the popup closed when pressed again.
      // (_execute_browser_action is handled by the browser and cannot be intercepted.)
      // Unmapped by default; assign a key in about:addons → Manage Extension Shortcuts.
      "toggle-popup": {
        description: "Open Zen Deck popup",
      },
      "change-tab-label": {
        suggested_key: {
          default: "Alt+R",
        },
        description: "Change Zen labels of the selected tabs",
      },
      "set-tab-timer": {
        suggested_key: {
          default: "Alt+T",
        },
        description: "Set a timer on the current tab",
      },
    },
    // IBM Plex Mono and Inter for the overlay: the content script declares them in the page's
    // document (a shadow root cannot), so the page has to be allowed to fetch it.
    web_accessible_resources: ["fonts/*.woff2"],
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
      zenHosts: {
        schema: "experiment/zenHosts/schema.json",
        parent: {
          scopes: ["addon_parent"],
          paths: [["zenHosts"]],
          script: "experiment/zenHosts/api.js",
        },
      },
      zenBackup: {
        schema: "experiment/zenBackup/schema.json",
        parent: {
          scopes: ["addon_parent"],
          paths: [["zenBackup"]],
          script: "experiment/zenBackup/api.js",
        },
      },
      zenUpdate: {
        schema: "experiment/zenUpdate/schema.json",
        parent: {
          scopes: ["addon_parent"],
          paths: [["zenUpdate"]],
          script: "experiment/zenUpdate/api.js",
        },
      },
    },
    browser_specific_settings: {
      gecko: {
        id: "zen-deck@extension.example",
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
      for (const file of FONT_FILES) {
        for (const weight of FONT_WEIGHTS) {
          const name = `${file}-latin-${weight}-normal.woff2`;
          files.push({
            relativeDest: `fonts/${name}`,
            absoluteSrc: resolve(`node_modules/@fontsource/${file}/files`, name),
          });
        }
      }
    },
  },
  // WXT's dev reload shortcut is Alt+R, which change-tab-label uses.
  // File-watch still rebuilds/reloads; this only skips WXT's shortcut.
  dev: {
    reloadCommand: false,
  },
  // WXT has no official Preact module; this is the documented Vite-plugin path.
  vite: () => ({
    envPrefix: ["VITE_", "WXT_"],
    plugins: [preact({ reactAliasesEnabled: false }), tailwindcss()],
  }),
});
