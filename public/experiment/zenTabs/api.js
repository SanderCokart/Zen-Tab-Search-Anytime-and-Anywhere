/* global ExtensionAPI, ChromeUtils */

this.zenTabs = class extends ExtensionAPI {
  getAPI(context) {
    const { tabManager } = context.extension;

    return {
      zenTabs: {
        async getCustomLabels(tabIds = []) {
          const labels = {};

          for (const tabId of tabIds) {
            try {
              const wrapper = tabManager.get(tabId);
              if (!wrapper) {
                continue;
              }

              const customLabel = wrapper.nativeTab?.zenStaticLabel;
              if (typeof customLabel === "string" && customLabel) {
                labels[tabId] = customLabel;
              }
            } catch {
              // skip inaccessible tabs
            }
          }

          try {
            const { Services } = ChromeUtils.import(
              "resource://gre/modules/Services.mjs",
            );

            for (const win of Services.wm.getEnumerator("navigator:browser")) {
              if (win.closed || !win.gBrowser) {
                continue;
              }

              for (const tab of win.gBrowser.tabs) {
                const customLabel = tab.zenStaticLabel;
                if (typeof customLabel !== "string" || !customLabel) {
                  continue;
                }

                const wrapper = tabManager.getWrapper(tab);
                if (wrapper) {
                  labels[wrapper.id] = customLabel;
                }
              }
            }
          } catch {
            // gBrowser fallback is best-effort
          }

          return labels;
        },
      },
    };
  }
};
