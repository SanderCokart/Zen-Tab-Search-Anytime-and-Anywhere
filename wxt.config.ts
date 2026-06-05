import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: ".",
  outDir: ".output",
  browser: "firefox",
  manifest: {
    name: "CCV Shop - Development Helper",
    description:
      "Helpers for CCV Shop theme and integration development, including message extraction from support and discussion tools.",
    permissions: ["activeTab"],
    browser_specific_settings: {
      gecko: {
        id: "ccvshop-dev-helper@ccvshop.local",
        strict_min_version: "140.0",
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
    web_accessible_resources: [
      {
        resources: [
          "inject-environment-bar.js",
          "icon/16.png",
          "icon/32.png",
          "icon/48.png",
          "icon/96.png",
          "icon/128.png",
        ],
        matches: ["*://*/*"],
      },
    ],
  },
  webExt: {
    disabled: true,
  },
});
