/* global ExtensionAPI, ChromeUtils, Cu, Services */

const DEBUG = false;

this.zenTabs = class extends ExtensionAPI {
  getAPI(context) {
    const { tabManager } = context.extension;
    const LOG_PREFIX = "[zen-tab-search experiment]";

    function debugLog(label, details) {
      if (!DEBUG) {
        return;
      }

      const payload = typeof details === "function" ? details() : details;
      const message =
        payload === undefined
          ? `${LOG_PREFIX} ${label}`
          : `${LOG_PREFIX} ${label}: ${JSON.stringify(payload)}`;

      try {
        console.error(message);
      } catch {
        // ignore
      }

      try {
        getServices().console.logStringMessage(message);
      } catch {
        // ignore
      }
    }

    function formatError(error) {
      if (!error) {
        return "unknown error";
      }

      if (typeof error === "string") {
        return error;
      }

      const message = error.message || String(error);
      const stack = error.stack ? `\n${error.stack}` : "";
      return `${message}${stack}`;
    }

    function getServices() {
      if (typeof Services !== "undefined" && Services?.wm) {
        return Services;
      }

      const attempts = [
        () => ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs").Services,
        () => ChromeUtils.import("resource://gre/modules/Services.jsm").Services,
        () => ChromeUtils.import("resource://gre/modules/Services.mjs").Services,
        () => Cu.import("resource://gre/modules/Services.jsm").Services,
      ];

      for (const attempt of attempts) {
        try {
          const services = attempt();
          if (services?.wm) {
            return services;
          }
        } catch {
          // try next import path
        }
      }

      throw new Error("Services unavailable in experiment parent scope");
    }

    function getWinForTab(tabId) {
      try {
        const wrapper = tabManager.get(tabId);
        const win = wrapper?.nativeTab?.ownerGlobal;
        if (win && !win.closed && win.gBrowser) {
          return win;
        }
      } catch (error) {
        debugLog("getWinForTab failed", { tabId, error: formatError(error) });
      }

      return null;
    }

    function enumerateZenBrowserWindows() {
      const windows = [];
      const seen = new Set();

      function addWindow(win) {
        if (!win || win.closed || seen.has(win) || !win.gBrowser) {
          return;
        }

        seen.add(win);
        windows.push(win);
      }

      const iterators = [
        () => (typeof tabManager.iterate === "function" ? tabManager.iterate() : null),
        () => tabManager,
        () => tabManager._tabs?.values?.(),
      ];

      for (const getIterator of iterators) {
        try {
          const iterator = getIterator();
          if (!iterator) {
            continue;
          }

          for (const wrapper of iterator) {
            addWindow(wrapper?.nativeTab?.ownerGlobal);
          }
        } catch {
          // try next iterator
        }
      }

      return windows;
    }

    function getWin(anchorTabId) {
      if (Number.isInteger(anchorTabId) && anchorTabId >= 0) {
        const anchored = getWinForTab(anchorTabId);
        if (anchored) {
          debugLog("getWin via anchor tab", {
            anchorTabId,
            hasGZenWorkspaces: !!anchored.gZenWorkspaces,
          });
          return anchored;
        }
      }

      for (const win of enumerateZenBrowserWindows()) {
        if (win.gZenWorkspaces) {
          debugLog("getWin via tabManager", { hasGZenWorkspaces: true });
          return win;
        }
      }

      for (const win of enumerateZenBrowserWindows()) {
        debugLog("getWin via tabManager (gBrowser only)");
        return win;
      }

      try {
        const recent = getServices().wm.getMostRecentWindow("navigator:browser");
        if (recent && !recent.closed) {
          debugLog("getWin wm fallback", { hasGZenWorkspaces: !!recent.gZenWorkspaces });
          return recent;
        }
      } catch (error) {
        debugLog("getWin wm fallback failed", { error: formatError(error) });
      }

      debugLog("getWin: no Zen browser window found", { anchorTabId });
      return null;
    }

    async function getZenWorkspaces(anchorTabId) {
      const win = getWin(anchorTabId);
      if (!win?.gZenWorkspaces) {
        debugLog("getZenWorkspaces: gZenWorkspaces missing on window", { anchorTabId });
        return null;
      }

      const zenWorkspaces = win.gZenWorkspaces;

      if (zenWorkspaces.promiseInitialized) {
        try {
          await zenWorkspaces.promiseInitialized;
        } catch (error) {
          debugLog("getZenWorkspaces: promiseInitialized rejected", {
            error: formatError(error),
          });
        }
      }

      return zenWorkspaces;
    }

    function getNativeTabByExtId(tabId) {
      try {
        return tabManager.get(tabId)?.nativeTab ?? null;
      } catch (error) {
        debugLog("getNativeTabByExtId failed", {
          tabId,
          error: formatError(error),
        });
        return null;
      }
    }

    function getNativeTabByDomId(domId, anchorTabId) {
      const win = getWin(anchorTabId);
      if (!win?.document || typeof domId !== "string" || !domId) {
        return null;
      }

      const tab = win.document.getElementById(domId);
      if (!tab || !win.gBrowser?.isTab?.(tab)) {
        return null;
      }

      return tab;
    }

    function getExtTabId(nativeTab) {
      try {
        return tabManager.getWrapper(nativeTab)?.id ?? -1;
      } catch {
        return -1;
      }
    }

    function unwrapFavicon(url) {
      if (!url) {
        return "";
      }

      let value = String(url);
      if (value.startsWith("moz-remote-image://")) {
        const match = value.match(/[?&]url=([^&#]+)/);
        if (!match) {
          return "";
        }
        try {
          value = decodeURIComponent(match[1]);
        } catch {
          return "";
        }
      }

      if (!value || value.startsWith("chrome://")) {
        return "";
      }

      return value;
    }

    function formatSpaceIcon(icon, name) {
      if (typeof icon === "string" && icon && !icon.startsWith("chrome://")) {
        return icon;
      }

      const trimmedName = (name || "Space").trim();
      return trimmedName.charAt(0).toUpperCase() || "S";
    }

    function collectTabs(win, zenWorkspaces) {
      const tabs = [];
      const seen = new Set();

      function addTab(tab) {
        if (!tab?.id || seen.has(tab.id)) {
          return;
        }

        if (!win.gBrowser?.isTab?.(tab)) {
          return;
        }

        if (tab.hasAttribute("zen-empty-tab") || tab.hasAttribute("zen-glance-tab")) {
          return;
        }

        seen.add(tab.id);
        tabs.push(tab);
      }

      try {
        for (const tab of zenWorkspaces.allStoredTabs) {
          addTab(tab);
        }
      } catch (error) {
        debugLog("collectTabs allStoredTabs failed", { error: formatError(error) });
      }

      if (tabs.length === 0) {
        try {
          for (const tab of win.document.querySelectorAll(".tabbrowser-tab")) {
            addTab(tab);
          }
        } catch (error) {
          debugLog("collectTabs querySelectorAll failed", { error: formatError(error) });
        }
      }

      return tabs;
    }

    async function activateNativeTab(tab, anchorTabId) {
      const win = getWin(anchorTabId);
      if (!win?.gBrowser || !win.gZenWorkspaces || !tab) {
        return false;
      }

      if (typeof win.gZenWorkspaces.switchTabIfNeeded === "function") {
        await win.gZenWorkspaces.switchTabIfNeeded(tab);
        return true;
      }

      const tabWorkspace = tab.getAttribute("zen-workspace-id") || null;
      const activeWorkspace = win.gZenWorkspaces.activeWorkspace;

      if (tabWorkspace && tabWorkspace !== activeWorkspace) {
        const lastSelectedTabs = win.gZenWorkspaces.lastSelectedWorkspaceTabs;
        const previousLastSelected = lastSelectedTabs && lastSelectedTabs[tabWorkspace];
        if (lastSelectedTabs) {
          lastSelectedTabs[tabWorkspace] = tab;
        }

        try {
          await win.gZenWorkspaces.changeWorkspaceWithID(tabWorkspace);
        } catch (error) {
          if (lastSelectedTabs) {
            lastSelectedTabs[tabWorkspace] = previousLastSelected;
          }
          throw error;
        }
      }

      win.gBrowser.selectedTab = tab;
      return true;
    }

    function buildDebugInfo(anchorTabId) {
      const info = {
        timestamp: new Date().toISOString(),
        anchorTabId: Number.isInteger(anchorTabId) ? anchorTabId : -1,
        servicesSource: "unknown",
        servicesImport: "unknown",
        windowSource: "none",
        tabManagerWindowCount: 0,
        windowFound: false,
        hasGZenWorkspaces: false,
        hasGBrowser: false,
        hasPromiseInitialized: false,
        workspaceEnabled: null,
        workspaceCount: 0,
        activeWorkspace: "",
        storedTabCount: 0,
        domTabCount: 0,
        errors: [],
      };

      try {
        if (typeof Services !== "undefined" && Services?.wm) {
          info.servicesSource = "global";
          info.servicesImport = "ok";
        } else {
          getServices();
          info.servicesSource = "import";
          info.servicesImport = "ok";
        }
      } catch (error) {
        info.servicesImport = "failed";
        info.errors.push(`getServices: ${formatError(error)}`);
        return info;
      }

      info.tabManagerWindowCount = enumerateZenBrowserWindows().length;

      try {
        let win = null;

        if (Number.isInteger(anchorTabId) && anchorTabId >= 0) {
          win = getWinForTab(anchorTabId);
          if (win) {
            info.windowSource = "anchorTab";
          }
        }

        if (!win) {
          const zenWindows = enumerateZenBrowserWindows();
          win = zenWindows.find((candidate) => candidate.gZenWorkspaces) ?? zenWindows[0] ?? null;
          if (win) {
            info.windowSource = "tabManager";
          }
        }

        if (!win) {
          win = getServices().wm.getMostRecentWindow("navigator:browser");
          if (win) {
            info.windowSource = "windowMediator";
          }
        }

        info.windowFound = !!win;
        info.hasGZenWorkspaces = !!win?.gZenWorkspaces;
        info.hasGBrowser = !!win?.gBrowser;

        if (!win?.gZenWorkspaces) {
          return info;
        }

        const zenWorkspaces = win.gZenWorkspaces;
        info.hasPromiseInitialized = !!zenWorkspaces.promiseInitialized;
        info.workspaceEnabled =
          typeof zenWorkspaces.workspaceEnabled === "boolean"
            ? zenWorkspaces.workspaceEnabled
            : null;
        info.activeWorkspace = String(zenWorkspaces.activeWorkspace || "");

        const workspaces = zenWorkspaces.getWorkspaces();
        info.workspaceCount = Array.isArray(workspaces) ? workspaces.length : 0;

        try {
          info.storedTabCount = zenWorkspaces.allStoredTabs.length;
        } catch (error) {
          info.errors.push(`allStoredTabs: ${formatError(error)}`);
        }

        try {
          info.domTabCount = win.document.querySelectorAll(".tabbrowser-tab").length;
        } catch (error) {
          info.errors.push(`domTabCount: ${formatError(error)}`);
        }
      } catch (error) {
        info.errors.push(`buildDebugInfo: ${formatError(error)}`);
      }

      return info;
    }

    return {
      zenTabs: {
        async getDebugInfo(anchorTabId = -1) {
          return buildDebugInfo(anchorTabId);
        },

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

          for (const win of enumerateZenBrowserWindows()) {
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

          return labels;
        },

        async getSpaces(anchorTabId = -1) {
          try {
            const zenWorkspaces = await getZenWorkspaces(anchorTabId);
            if (!zenWorkspaces) {
              throw new Error(
                `Zen browser window not found (anchorTabId=${anchorTabId}). Is this running in Zen Browser?`,
              );
            }

            const activeSpaceId = String(zenWorkspaces.activeWorkspace || "");
            return zenWorkspaces.getWorkspaces().map((space) => ({
              id: String(space.uuid || ""),
              name: String(space.name || "Untitled"),
              icon: formatSpaceIcon(space.icon, space.name),
              isActive: String(space.uuid || "") === activeSpaceId,
            }));
          } catch (error) {
            const details = formatError(error);
            debugLog("getSpaces failed", () => ({
              anchorTabId,
              error: details,
              debug: buildDebugInfo(anchorTabId),
            }));
            throw new Error(`getSpaces failed: ${details}`);
          }
        },

        async getAllTabs(anchorTabId = -1) {
          try {
            const win = getWin(anchorTabId);
            const zenWorkspaces = await getZenWorkspaces(anchorTabId);
            if (!win || !zenWorkspaces) {
              throw new Error(
                `Zen browser window not found (anchorTabId=${anchorTabId}). Is this running in Zen Browser?`,
              );
            }

            const spaceNames = new Map(
              zenWorkspaces
                .getWorkspaces()
                .map((space) => [String(space.uuid || ""), String(space.name || "Untitled")]),
            );
            const results = [];

            for (const tab of collectTabs(win, zenWorkspaces)) {
              const workspaceId = String(tab.getAttribute("zen-workspace-id") || "");
              const customLabel = tab.zenStaticLabel;
              const extTabId = getExtTabId(tab);

              results.push({
                id: Number.isInteger(extTabId) && extTabId >= 0 ? extTabId : -1,
                domId: String(tab.id || ""),
                title: String(tab.label || "Untitled"),
                customLabel:
                  typeof customLabel === "string" && customLabel ? String(customLabel) : "",
                url: String(tab.linkedBrowser?.currentURI?.spec || ""),
                favIconUrl: String(unwrapFavicon(tab.image)),
                windowId: Number(win.windowUtils?.outerWindowID ?? -1),
                workspaceId,
                workspaceName: String(spaceNames.get(workspaceId) || ""),
              });
            }

            return results;
          } catch (error) {
            const details = formatError(error);
            debugLog("getAllTabs failed", () => ({
              anchorTabId,
              error: details,
              debug: buildDebugInfo(anchorTabId),
            }));
            throw new Error(`getAllTabs failed: ${details}`);
          }
        },

        async switchSpace(spaceId, anchorTabId = -1) {
          try {
            const zenWorkspaces = await getZenWorkspaces(anchorTabId);
            if (!zenWorkspaces || typeof spaceId !== "string" || !spaceId) {
              return false;
            }

            await zenWorkspaces.changeWorkspaceWithID(spaceId);
            return true;
          } catch (error) {
            throw new Error(`switchSpace failed: ${formatError(error)}`);
          }
        },

        async activateTab(tabId, anchorTabId = -1) {
          try {
            if (!Number.isInteger(tabId) || tabId < 0) {
              return false;
            }

            const nativeTab = getNativeTabByExtId(tabId);
            if (!nativeTab) {
              return false;
            }

            return activateNativeTab(nativeTab, anchorTabId);
          } catch (error) {
            throw new Error(`activateTab failed: ${formatError(error)}`);
          }
        },

        async activateTabByDomId(domId, anchorTabId = -1) {
          try {
            const nativeTab = getNativeTabByDomId(domId, anchorTabId);
            if (!nativeTab) {
              return false;
            }

            return activateNativeTab(nativeTab, anchorTabId);
          } catch (error) {
            throw new Error(`activateTabByDomId failed: ${formatError(error)}`);
          }
        },
      },
    };
  }
};
