import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { defineConfig } from "wxt";
// @ts-expect-error - plain .mjs build helper with no type declarations
import { injectExperimentDebugAsset } from "./scripts/experiment-debug.mjs";

// The overlay's fonts, shipped as plain files (see shared/ui/page-fonts.ts for why).
// Only the weights the UI uses; keep in step with shared/ui/fonts.css and page-fonts.ts.
const FONT_FILES = [
  { file: "ibm-plex-mono", weights: [400, 500, 600] },
  { file: "inter", weights: [400, 500] },
];

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
      // Copy link on a tab row and in the overlay context menu.
      "clipboardWrite",
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
    // No default_popup: a click on the toolbar button fires browserAction.onClicked,
    // which opens the same overlay as Alt+F (app/background/commands.ts).
    browser_action: {
      default_title: "Zen Deck: open the omnibar",
      default_icon: {
        48: "icon/48.png",
        96: "icon/96.png",
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
    // The MCP server is not shipped here: the settings page downloads it from the
    // GitHub release that matches the extension (features/bridge/model/mcp-install.ts).
    "build:publicAssets": (wxt, files) => {
      injectExperimentDebugAsset(wxt, files);
      for (const { file, weights } of FONT_FILES) {
        for (const weight of weights) {
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
    build: {
      rollupOptions: {
        // `/fonts/*.woff2` is copied into the extension by the build hook above, after
        // Vite has processed CSS. Marking it external leaves the URLs unchanged and
        // silences Vite's "didn't resolve at build time" warning.
        external: (id: string) => id.startsWith("/fonts/"),
      },
    },
    // Motion's Reorder lives in `motion/react` and imports `react`. Preact is
    // not supported; this alias is the documented compat path.
    resolve: {
      alias: {
        react: "preact/compat",
        "react-dom": "preact/compat",
        "react/jsx-runtime": "preact/jsx-runtime",
      },
    },
  }),
});
