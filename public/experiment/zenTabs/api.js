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

    function isBrowserWindow(win) {
      return Boolean(win && !win.closed && win.gBrowser);
    }

    /**
     * Zen's inline tab rename. Zen 1.23 moved it from
     * `gZenVerticalTabsManager.renameTabStart` to `gZenTabRenamer.start`; both take
     * an event-like `{ target }`. Returns undefined when neither exists.
     */
    function getRenameStarter(win) {
      const renamer = win.gZenTabRenamer;
      if (typeof renamer?.start === "function") {
        return Object.assign((event) => renamer.start(event), { api: "gZenTabRenamer.start" });
      }
      const manager = win.gZenVerticalTabsManager;
      if (typeof manager?.renameTabStart === "function") {
        return Object.assign((event) => manager.renameTabStart(event), {
          api: "gZenVerticalTabsManager.renameTabStart",
        });
      }
      return undefined;
    }

    function readBoolPref(name) {
      try {
        return getServices().prefs.getBoolPref(name);
      } catch {
        return null;
      }
    }

    function chromeWindowForNativeTab(tab) {
      return tab?.ownerGlobal || tab?.ownerDocument?.defaultView || null;
    }

    function windowContainsExtTabId(win, tabId) {
      if (!isBrowserWindow(win)) {
        return false;
      }

      try {
        for (const tab of win.gBrowser.tabs) {
          if (getExtTabId(tab) === tabId) {
            return true;
          }
        }
      } catch {
        // gBrowser.tabs can throw while a window is tearing down.
      }

      try {
        const stored = win.gZenWorkspaces?.allStoredTabs;
        if (stored) {
          for (const tab of stored) {
            if (getExtTabId(tab) === tabId) {
              return true;
            }
          }
        }
      } catch {
        // Hidden-space tab lists are best-effort.
      }

      return false;
    }

    function getWinForTab(tabId) {
      try {
        const wrapper = tabManager.get(tabId);
        const native = wrapper?.nativeTab;
        const win = chromeWindowForNativeTab(native);
        if (isBrowserWindow(win)) {
          return win;
        }
      } catch (error) {
        debugLog("getWinForTab tabManager.get failed", { tabId, error: formatError(error) });
      }

      for (const win of enumerateAllBrowserWindows()) {
        if (windowContainsExtTabId(win, tabId)) {
          return win;
        }
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

    function enumerateMediatorWindows() {
      const windows = [];
      try {
        const recent = getServices().wm.getMostRecentWindow("navigator:browser");
        if (recent) {
          windows.push(recent);
        }
        const enumerator = getServices().wm.getEnumerator("navigator:browser");
        while (enumerator.hasMoreElements()) {
          windows.push(enumerator.getNext());
        }
      } catch (error) {
        debugLog("getWin wm enumerator failed", { error: formatError(error) });
      }
      return windows;
    }

    function enumerateAllBrowserWindows() {
      const windows = [];
      const seen = new Set();

      function add(win) {
        if (!isBrowserWindow(win) || seen.has(win)) {
          return;
        }
        seen.add(win);
        windows.push(win);
      }

      for (const win of enumerateZenBrowserWindows()) {
        add(win);
      }
      for (const win of enumerateMediatorWindows()) {
        add(win);
      }
      return windows;
    }

    function resolveWindow(anchorTabId) {
      // Each Zen window has its own gBrowser / gZenWorkspaces. Picking the first
      // enumerated window makes search, rename, and activation hit the oldest
      // instance whenever more than one is open.
      if (Number.isInteger(anchorTabId) && anchorTabId >= 0) {
        const anchored = getWinForTab(anchorTabId);
        if (anchored) {
          debugLog("getWin via anchor tab", { anchorTabId });
          return { win: anchored, source: "anchor" };
        }
      }

      try {
        const recent = getServices().wm.getMostRecentWindow("navigator:browser");
        if (isBrowserWindow(recent)) {
          debugLog("getWin via most recent browser window", { anchorTabId });
          return { win: recent, source: "most-recent" };
        }
      } catch (error) {
        debugLog("getWin most-recent failed", { error: formatError(error) });
      }

      const candidates = enumerateAllBrowserWindows();
      const zen = candidates.find((win) => win.gZenWorkspaces);
      if (zen) {
        debugLog("getWin via enumerated Zen window", {
          anchorTabId,
          candidateCount: candidates.length,
        });
        return { win: zen, source: "zen" };
      }

      const fallback = candidates[0];
      if (fallback) {
        debugLog("getWin via browser window without Zen workspaces", { anchorTabId });
        return { win: fallback, source: "browser" };
      }

      debugLog("getWin: no Zen browser window found", { anchorTabId });
      return { win: null, source: "none" };
    }

    function getWin(anchorTabId) {
      return resolveWindow(anchorTabId).win;
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

    // WebExtensions tabs do not expose Firefox's fromExternal load flag, which
    // is how a mail client (or any other app) opens Zen as the default browser.
    const EXTERNAL_HOOK_KEY = "__zenTabSearchExternalHook";
    const EXTERNAL_URL_KEY = "__zenTabSearchExternalUrl";
    const pendingExternalTabs = new Map();
    let externalHookInstalled = false;

    function externalTabUrl(uri) {
      if (typeof uri === "string") {
        return uri;
      }
      if (uri && typeof uri.spec === "string") {
        return uri.spec;
      }
      return "";
    }

    function rememberExternalTab(tab, uri) {
      const url = externalTabUrl(uri);
      if (!url || !tab) {
        return;
      }

      tab[EXTERNAL_URL_KEY] = url;
      const store = () => {
        const tabId = getExtTabId(tab);
        if (!Number.isInteger(tabId) || tabId < 0) {
          return false;
        }
        pendingExternalTabs.set(tabId, { url, at: Date.now() });
        return true;
      };

      if (store()) {
        return;
      }

      Promise.resolve().then(() => {
        if (!store()) {
          setTimeout(store, 0);
        }
      });
    }

    function pruneExternalTabs() {
      const cutoff = Date.now() - 10_000;
      for (const [tabId, entry] of pendingExternalTabs) {
        if (!entry || entry.at < cutoff) {
          pendingExternalTabs.delete(tabId);
        }
      }
    }

    function hookBrowserAddTab(win) {
      const gBrowser = win?.gBrowser;
      if (!gBrowser || typeof gBrowser.addTab !== "function") {
        return;
      }

      const existing = gBrowser[EXTERNAL_HOOK_KEY];
      if (existing) {
        existing.remember = rememberExternalTab;
        return;
      }

      const original = gBrowser.addTab;
      const state = { remember: rememberExternalTab };
      gBrowser.addTab = function (...args) {
        const tab = original.apply(this, args);
        try {
          const options = args[1];
          if (options && options.fromExternal) {
            state.remember(tab, args[0]);
          }
        } catch (error) {
          debugLog("external tab hook failed", { error: formatError(error) });
        }
        return tab;
      };
      gBrowser[EXTERNAL_HOOK_KEY] = state;
    }

    function watchBrowserWindow(win) {
      if (!win || win.closed) {
        return;
      }
      if (win.gBrowser) {
        hookBrowserAddTab(win);
        return;
      }
      win.addEventListener("load", () => hookBrowserAddTab(win), { once: true });
    }

    function installExternalTabHook() {
      if (externalHookInstalled) {
        return;
      }
      externalHookInstalled = true;

      for (const win of enumerateZenBrowserWindows()) {
        watchBrowserWindow(win);
      }

      let services;
      try {
        services = getServices();
      } catch (error) {
        debugLog("external tab hook: Services unavailable", { error: formatError(error) });
        return;
      }

      try {
        const enumerator = services.wm.getEnumerator("navigator:browser");
        while (enumerator.hasMoreElements()) {
          watchBrowserWindow(enumerator.getNext());
        }
      } catch (error) {
        debugLog("external tab hook: window enumeration failed", { error: formatError(error) });
      }

      const windowObserver = {
        observe(subject) {
          watchBrowserWindow(subject);
        },
      };

      try {
        services.obs.addObserver(windowObserver, "domwindowopened");
        context.callOnClose({
          close() {
            try {
              services.obs.removeObserver(windowObserver, "domwindowopened");
            } catch {
              // The observer is already gone when the extension unloads.
            }
          },
        });
      } catch (error) {
        debugLog("external tab hook: domwindowopened observer failed", {
          error: formatError(error),
        });
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

    function collectSelectedNativeTabs(win, zenWorkspaces) {
      const selected = [];
      const seen = new Set();

      function add(tab) {
        if (!tab || seen.has(tab)) {
          return;
        }

        if (typeof win.gBrowser?.isTab === "function" && !win.gBrowser.isTab(tab)) {
          return;
        }

        if (tab.hasAttribute?.("zen-empty-tab") || tab.hasAttribute?.("zen-glance-tab")) {
          return;
        }

        seen.add(tab);
        selected.push(tab);
      }

      const nativeSelected = win.gBrowser?.selectedTabs;
      if (nativeSelected && typeof nativeSelected[Symbol.iterator] === "function") {
        for (const tab of nativeSelected) {
          add(tab);
        }
      }

      try {
        for (const tab of collectTabs(win, zenWorkspaces)) {
          if (tab.multiselected === true || tab.hasAttribute?.("multiselected")) {
            add(tab);
          }
        }
      } catch (error) {
        debugLog("collectSelectedNativeTabs collectTabs failed", { error: formatError(error) });
      }

      if (selected.length === 0 && win.gBrowser?.selectedTab) {
        add(win.gBrowser.selectedTab);
      }

      return selected;
    }

    function getWorkspaceNameMap(zenWorkspaces) {
      return new Map(
        zenWorkspaces
          .getWorkspaces()
          .map((space) => [String(space.uuid || ""), String(space.name || "Untitled")]),
      );
    }

    function getFolderPath(tab) {
      let group = tab?.group;
      const folders = [];
      while (group) {
        if (group.isZenFolder) {
          folders.push({
            id: String(group.id || ""),
            name: String(group.label || "Folder"),
          });
        }
        group = group.group;
      }
      return folders.reverse();
    }

    function getSessionStoreTitle(tab) {
      try {
        const SessionStore = tab.ownerGlobal?.SessionStore;
        if (!SessionStore?.getTabState) {
          return "";
        }

        const raw = SessionStore.getTabState(tab);
        const state = typeof raw === "string" ? JSON.parse(raw) : raw;
        const entries = state?.entries || [];
        if (!entries.length) {
          return "";
        }

        const index = Math.max(0, (state.index || entries.length) - 1);
        return String(entries[index]?.title || "").trim();
      } catch {
        return "";
      }
    }

    function getOriginalTabTitle(tab, customLabel) {
      const custom = typeof customLabel === "string" ? customLabel.trim() : "";
      const displayed = String(tab.label || "").trim();
      const candidates = [];

      try {
        const contentTitle = String(tab.linkedBrowser?.contentTitle || "").trim();
        if (contentTitle) {
          candidates.push(contentTitle);
        }
      } catch {
        // contentTitle is best-effort for unloaded or hidden tabs.
      }

      const sessionTitle = getSessionStoreTitle(tab);
      if (sessionTitle) {
        candidates.push(sessionTitle);
      }

      if (displayed && displayed !== custom) {
        candidates.push(displayed);
      }

      const original = candidates.find((value) => value && value !== custom);
      return original || displayed || custom || "Untitled";
    }

    function mapNativeTab(tab, win, spaceNames) {
      const workspaceId = String(tab.getAttribute("zen-workspace-id") || "");
      const customLabel =
        typeof tab.zenStaticLabel === "string" && tab.zenStaticLabel
          ? String(tab.zenStaticLabel)
          : "";
      const folderPath = getFolderPath(tab);
      const folder = folderPath[folderPath.length - 1];
      const extTabId = getExtTabId(tab);

      return {
        id: Number.isInteger(extTabId) && extTabId >= 0 ? extTabId : -1,
        domId: String(tab.id || ""),
        title: getOriginalTabTitle(tab, customLabel),
        customLabel,
        url: String(tab.linkedBrowser?.currentURI?.spec || ""),
        favIconUrl: String(unwrapFavicon(tab.image)),
        windowId: Number(win.windowUtils?.outerWindowID ?? -1),
        workspaceId,
        workspaceName: String(spaceNames.get(workspaceId) || ""),
        folderId: folder?.id || undefined,
        folderName: folder?.name || undefined,
        folderPath: folderPath.length ? folderPath : undefined,
        essential: tab.getAttribute("zen-essential") === "true",
        active: win.gBrowser?.selectedTab === tab,
      };
    }

    async function activateNativeTab(tab) {
      const win = chromeWindowForNativeTab(tab);
      if (!win?.gBrowser || !tab) {
        return false;
      }

      try {
        win.focus();
      } catch {
        // The tab's window should come to the front when it is not focused.
      }

      if (typeof win.gZenWorkspaces?.switchTabIfNeeded === "function") {
        await win.gZenWorkspaces.switchTabIfNeeded(tab);
        return true;
      }

      const tabWorkspace = tab.getAttribute("zen-workspace-id") || null;
      const zenWorkspaces = win.gZenWorkspaces;
      const activeWorkspace = zenWorkspaces?.activeWorkspace;

      if (zenWorkspaces && tabWorkspace && tabWorkspace !== activeWorkspace) {
        const lastSelectedTabs = zenWorkspaces.lastSelectedWorkspaceTabs;
        const previousLastSelected = lastSelectedTabs && lastSelectedTabs[tabWorkspace];
        if (lastSelectedTabs) {
          lastSelectedTabs[tabWorkspace] = tab;
        }

        try {
          await zenWorkspaces.changeWorkspaceWithID(tabWorkspace);
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
        const resolved = resolveWindow(anchorTabId);
        const win = resolved.win;
        info.windowSource = resolved.source;

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

    // Bridge helpers. Writes address tabs and folders by extension tab ID or
    // folder DOM id, so they work regardless of which window is "current".
    function nativeTabsFor(tabIds) {
      return tabIds.map((tabId) => {
        const tab = getNativeTabByExtId(tabId);
        if (!tab) {
          throw new Error(`Tab not found: ${tabId}`);
        }
        return tab;
      });
    }

    function windowForTabs(tabs) {
      const windows = [...new Set(tabs.map((tab) => chromeWindowForNativeTab(tab)))];
      const [win] = windows;
      if (windows.length !== 1 || !win?.gBrowser) {
        throw new Error("Tabs must all be in the same Zen window.");
      }
      return win;
    }

    function ensureMovable(tabs) {
      const essential = tabs.find((tab) => tab.getAttribute("zen-essential") === "true");
      if (essential) {
        throw new Error(`Essential tabs cannot be moved: ${getExtTabId(essential)}`);
      }
    }

    function findFolder(folderId) {
      if (typeof folderId !== "string" || !folderId) {
        throw new Error(`Zen folder not found: ${folderId}`);
      }
      // Match folders the way listFolders does: every browser window, not only those
      // tabManager yields, and scan zen-folder elements, since getElementById
      // returns the first element with that ID, which need not be the folder.
      for (const win of enumerateAllBrowserWindows()) {
        const folder = [...(win.document?.querySelectorAll("zen-folder") ?? [])].find(
          (entry) => entry.isZenFolder && String(entry.id || "") === folderId,
        );
        if (folder) {
          return { win, folder };
        }
      }
      throw new Error(`Zen folder not found: ${folderId}`);
    }

    function expandFolder(folder) {
      let current = folder;
      while (current?.isZenFolder) {
        current.collapsed = false;
        current = current.group?.isZenFolder ? current.group : null;
      }
    }

    function isFolderOrAncestor(folder, maybeAncestor) {
      let current = maybeAncestor;
      while (current?.isZenFolder) {
        if (current === folder) {
          return true;
        }
        current = current.group?.isZenFolder ? current.group : null;
      }
      return false;
    }

    function folderDepth(folder) {
      let depth = 0;
      let current = folder;
      while (current?.group?.isZenFolder) {
        depth++;
        current = current.group;
      }
      return depth;
    }

    function folderHasContent(folder) {
      const items = folder?.allItems;
      if (!items) {
        return false;
      }
      for (const item of items) {
        if (item?.isZenFolder) {
          return true;
        }
        if (item?.hasAttribute?.("zen-empty-tab")) {
          continue;
        }
        return true;
      }
      return false;
    }

    function placeFolder(folder, { parent, after, pinnedContainer }) {
      if (after) {
        after.after(folder);
        return;
      }
      if (parent?.groupContainer) {
        expandFolder(parent);
        const last = parent.groupContainer.lastElementChild;
        if (last) {
          last.after(folder);
        } else {
          parent.groupContainer.appendChild(folder);
        }
        return;
      }
      if (!pinnedContainer) {
        throw new Error("Pinned tabs container not found for that space.");
      }
      if (pinnedContainer.lastChild) {
        pinnedContainer.insertBefore(folder, pinnedContainer.lastChild);
      } else {
        pinnedContainer.appendChild(folder);
      }
    }

    async function zenWorkspacesOf(win) {
      const zenWorkspaces = win?.gZenWorkspaces;
      if (!zenWorkspaces) {
        throw new Error("Zen spaces are not available in this window.");
      }
      if (zenWorkspaces.promiseInitialized) {
        try {
          await zenWorkspaces.promiseInitialized;
        } catch {
          // Keep going with whatever state Zen has.
        }
      }
      return zenWorkspaces;
    }

    function folderSummary(folder, spaceNames) {
      const spaceId = String(folder.getAttribute("zen-workspace-id") || "");
      const parent = folder.group;
      return {
        id: String(folder.id || ""),
        name: String(folder.label || "Folder"),
        spaceId,
        spaceName: String(spaceNames.get(spaceId) || ""),
        parentId: parent?.isZenFolder ? String(parent.id || "") : undefined,
        collapsed: folder.collapsed === true,
      };
    }

    function cleanName(name, fallback) {
      const cleaned = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
      return cleaned || fallback;
    }

    try {
      installExternalTabHook();
    } catch (error) {
      debugLog("external tab hook install failed", { error: formatError(error) });
    }

    function getExtensionError() {
      try {
        return ChromeUtils.importESModule("resource://gre/modules/ExtensionUtils.sys.mjs")
          .ExtensionUtils.ExtensionError;
      } catch (error) {
        debugLog("ExtensionError unavailable", { error: formatError(error) });
        return undefined;
      }
    }

    /**
     * Firefox replaces any error an experiment throws with "An unexpected error
     * occurred" unless it is an ExtensionError, so rethrow as one to keep the
     * message. Only the first line is kept; formatError appends stacks.
     */
    function exposeErrors(api) {
      const ExtensionError = getExtensionError();
      if (!ExtensionError) {
        return api;
      }

      return Object.fromEntries(
        Object.entries(api).map(([name, method]) => [
          name,
          async (...args) => {
            try {
              return await method(...args);
            } catch (error) {
              if (error instanceof ExtensionError) {
                throw error;
              }
              debugLog(`${name} failed`, { error: formatError(error) });
              const message = typeof error === "string" ? error : error?.message || String(error);
              throw new ExtensionError(message.split("\n")[0] || `${name} failed`);
            }
          },
        ]),
      );
    }

    return {
      zenTabs: exposeErrors({
        async consumeExternalTab(tabId) {
          pruneExternalTabs();
          if (!Number.isInteger(tabId) || tabId < 0) {
            return "";
          }

          const pending = pendingExternalTabs.get(tabId);
          if (pending?.url) {
            pendingExternalTabs.delete(tabId);
            return pending.url;
          }

          const nativeTab = getNativeTabByExtId(tabId);
          const url = nativeTab?.[EXTERNAL_URL_KEY];
          if (typeof url === "string" && url) {
            nativeTab[EXTERNAL_URL_KEY] = "";
            return url;
          }

          return "";
        },

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
            return zenWorkspaces
              .getWorkspaces()
              .map((space) => ({
                id: String(space.uuid || ""),
                name: String(space.name || "Untitled"),
                icon: formatSpaceIcon(space.icon, space.name),
                color: typeof space.color === "string" ? space.color : undefined,
                isActive: String(space.uuid || "") === activeSpaceId,
              }))
              .filter((space) => space.id);
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

            const spaceNames = getWorkspaceNameMap(zenWorkspaces);
            return collectTabs(win, zenWorkspaces).map((tab) => mapNativeTab(tab, win, spaceNames));
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

        async getSelectedTabs(anchorTabId = -1) {
          try {
            const win = getWin(anchorTabId);
            const zenWorkspaces = await getZenWorkspaces(anchorTabId);
            if (!win?.gBrowser || !zenWorkspaces) {
              return [];
            }

            const spaceNames = getWorkspaceNameMap(zenWorkspaces);
            return collectSelectedNativeTabs(win, zenWorkspaces).map((tab) =>
              mapNativeTab(tab, win, spaceNames),
            );
          } catch (error) {
            const details = formatError(error);
            debugLog("getSelectedTabs failed", () => ({
              anchorTabId,
              error: details,
              debug: buildDebugInfo(anchorTabId),
            }));
            throw new Error(`getSelectedTabs failed: ${details}`);
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

        async changeLabel(anchorTabId = -1) {
          try {
            let tab = null;
            if (Number.isInteger(anchorTabId) && anchorTabId >= 0) {
              tab = getNativeTabByExtId(anchorTabId);
            }
            const foundById = Boolean(tab);
            const win = chromeWindowForNativeTab(tab) || getWin(anchorTabId);
            if (!win?.gBrowser) {
              debugLog("changeLabel: no browser window", { anchorTabId, foundById });
              return false;
            }
            if (!tab) {
              tab = win.gBrowser.selectedTab;
            }
            if (!tab || (typeof win.gBrowser.isTab === "function" && !win.gBrowser.isTab(tab))) {
              debugLog("changeLabel: no usable tab", { anchorTabId, foundById, hasTab: !!tab });
              return false;
            }

            const renameState = () => ({
              renaming: win.document.documentElement.hasAttribute("zen-renaming-tab"),
              hasInput: !!win.document.getElementById("tab-label-input"),
            });
            debugLog("changeLabel: target", () => ({
              anchorTabId,
              foundById,
              isSelectedTab: tab === win.gBrowser.selectedTab,
              label: tab.label,
              pinned: !!tab.pinned,
              essential: tab.hasAttribute?.("zen-essential") ?? false,
              hidden: !!tab.hidden,
              windowFocused: win.document.hasFocus?.() ?? null,
              // Zen's window-level state: compact mode, sidebar expanded, …
              zenWindowAttributes: [...win.document.documentElement.attributes]
                .map((attribute) => attribute.name)
                .filter((name) => name.startsWith("zen-")),
              before: renameState(),
            }));

            const startRename = getRenameStarter(win);
            if (!startRename) {
              debugLog("changeLabel: no Zen rename API", {
                anchorTabId,
                hasTabRenamer: !!win.gZenTabRenamer,
                hasVerticalTabsManager: !!win.gZenVerticalTabsManager,
              });
              return false;
            }
            // Zen's renamer silently does nothing when either of these is off.
            debugLog("changeLabel: preconditions", () => ({
              api: startRename.api,
              renameTabsPref: readBoolPref("zen.tabs.rename-tabs"),
              sidebarExpandedPref: win.gZenVerticalTabsManager?._prefsSidebarExpanded ?? null,
            }));

            try {
              win.focus();
            } catch {
              // Window focus is best-effort so the rename input can receive keys.
            }

            if (win.TabContextMenu) {
              win.TabContextMenu.contextTab = tab;
            }

            startRename({ target: tab });

            const after = renameState();
            debugLog("changeLabel: after starting the rename", after);
            if (DEBUG) {
              // A rename that starts late reports false here; this shows whether it did.
              win.setTimeout(() => debugLog("changeLabel: 250ms later", renameState()), 250);
            }
            return after.renaming || after.hasInput;
          } catch (error) {
            throw new Error(`changeLabel failed: ${formatError(error)}`);
          }
        },

        async setLabel(label, anchorTabId = -1, silent = false) {
          try {
            const newName = typeof label === "string" ? label.replace(/\s+/g, " ").trim() : "";

            let tab = null;
            if (Number.isInteger(anchorTabId) && anchorTabId >= 0) {
              tab = getNativeTabByExtId(anchorTabId);
            }
            const win = chromeWindowForNativeTab(tab) || getWin(anchorTabId);
            if (!win?.gBrowser) {
              return false;
            }
            if (!tab) {
              tab = win.gBrowser.selectedTab;
            }
            if (!tab || (typeof win.gBrowser.isTab === "function" && !win.gBrowser.isTab(tab))) {
              return false;
            }

            tab.zenStaticLabel = newName;
            if (newName && typeof win.gBrowser._setTabLabel === "function") {
              win.gBrowser._setTabLabel(tab, newName, { _zenChangeLabelFlag: true });
            } else if (typeof win.gBrowser.setTabTitle === "function") {
              win.gBrowser.setTabTitle(tab);
            }

            if (newName && !silent) {
              try {
                win.gZenUIManager?.showToast?.("zen-tabs-renamed");
              } catch {
                // Toast is optional.
              }
            }

            return true;
          } catch (error) {
            throw new Error(`setLabel failed: ${formatError(error)}`);
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

            return activateNativeTab(nativeTab);
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

            return activateNativeTab(nativeTab);
          } catch (error) {
            throw new Error(`activateTabByDomId failed: ${formatError(error)}`);
          }
        },

        async listFolders(anchorTabId = -1) {
          try {
            const win = getWin(anchorTabId);
            const zenWorkspaces = await getZenWorkspaces(anchorTabId);
            if (!win?.document || !zenWorkspaces) {
              throw new Error(`Zen browser window not found (anchorTabId=${anchorTabId}).`);
            }

            const spaceNames = getWorkspaceNameMap(zenWorkspaces);
            return [...win.document.querySelectorAll("zen-folder")].map((folder) =>
              folderSummary(folder, spaceNames),
            );
          } catch (error) {
            throw new Error(`listFolders failed: ${formatError(error)}`);
          }
        },

        async createFolder(name, spaceId = "", tabIds = [], parentId = "", anchorTabId = -1) {
          try {
            let win;
            let parent = null;
            if (parentId) {
              const found = findFolder(parentId);
              win = found.win;
              parent = found.folder;
            } else {
              win = getWin(anchorTabId);
            }
            const zenWorkspaces = await zenWorkspacesOf(win);
            const parentSpace = parent ? String(parent.getAttribute("zen-workspace-id") || "") : "";
            const targetSpace =
              spaceId || parentSpace || String(zenWorkspaces.activeWorkspace || "");
            if (!targetSpace || !zenWorkspaces.getWorkspaceFromId(targetSpace)) {
              throw new Error(`Space not found: ${spaceId || targetSpace}`);
            }
            if (parentSpace && spaceId && parentSpace !== spaceId) {
              throw new Error(`Parent folder is in space ${parentSpace}, not ${spaceId}.`);
            }
            if (parent && typeof parent.level === "number" && parent.level >= 4) {
              throw new Error("Cannot nest a folder any deeper.");
            }

            const tabs = nativeTabsFor(tabIds);
            ensureMovable(tabs);
            if (tabs.length) {
              zenWorkspaces.moveTabsToWorkspace(tabs, targetSpace);
            }

            if (parent) {
              expandFolder(parent);
            }

            // Zen pins the tabs it groups into a folder; that is Zen's own rule, not ours.
            // Nested folders use the same insertAfter as Zen's createSubfolder.
            const folder = win.gZenFolders.createFolder(tabs, {
              label: cleanName(name, "New Folder"),
              workspaceId: targetSpace,
              renameFolder: false,
              ...(parent?.groupContainer?.lastElementChild
                ? { insertAfter: parent.groupContainer.lastElementChild }
                : {}),
            });
            return String(folder.id);
          } catch (error) {
            throw new Error(`createFolder failed: ${formatError(error)}`);
          }
        },

        async renameFolder(folderId, name) {
          try {
            const label = cleanName(name, "");
            if (!label) {
              throw new Error("Folder name cannot be empty.");
            }
            findFolder(folderId).folder.label = label;
            return true;
          } catch (error) {
            throw new Error(`renameFolder failed: ${formatError(error)}`);
          }
        },

        async moveTabsToFolder(tabIds, folderId) {
          try {
            const { win: folderWindow, folder } = findFolder(folderId);
            const tabs = nativeTabsFor(tabIds);
            ensureMovable(tabs);
            if (windowForTabs(tabs) !== folderWindow) {
              throw new Error("Tabs must be in the same Zen window as the folder.");
            }

            const zenWorkspaces = await zenWorkspacesOf(folderWindow);
            const folderSpace = String(folder.getAttribute("zen-workspace-id") || "");
            const otherSpaceTabs = tabs.filter(
              (tab) => tab.getAttribute("zen-workspace-id") !== folderSpace,
            );
            if (folderSpace && otherSpaceTabs.length) {
              zenWorkspaces.moveTabsToWorkspace(otherSpaceTabs, folderSpace);
            }

            // Folders hold pinned tabs, so pin anything that is not yet pinned.
            for (const tab of tabs) {
              if (!tab.pinned) {
                folderWindow.gBrowser.pinTab(tab);
              }
            }
            folder.addTabs(tabs);
            return tabs.length;
          } catch (error) {
            throw new Error(`moveTabsToFolder failed: ${formatError(error)}`);
          }
        },

        async removeTabsFromFolder(tabIds) {
          try {
            const tabs = nativeTabsFor(tabIds);
            let removed = 0;
            for (const tab of tabs) {
              if (!tab.group?.isZenFolder) {
                continue;
              }
              chromeWindowForNativeTab(tab).gBrowser.ungroupTab(tab);
              removed++;
            }
            return removed;
          } catch (error) {
            throw new Error(`removeTabsFromFolder failed: ${formatError(error)}`);
          }
        },

        async moveTabsToSpace(tabIds, spaceId) {
          try {
            const tabs = nativeTabsFor(tabIds);
            ensureMovable(tabs);
            const win = windowForTabs(tabs);
            const zenWorkspaces = await zenWorkspacesOf(win);
            if (!zenWorkspaces.getWorkspaceFromId(spaceId)) {
              throw new Error(`Space not found: ${spaceId}`);
            }
            zenWorkspaces.moveTabsToWorkspace(tabs, spaceId);
            return tabs.length;
          } catch (error) {
            throw new Error(`moveTabsToSpace failed: ${formatError(error)}`);
          }
        },

        async moveTab(tabId, beforeTabId = -1, afterTabId = -1) {
          try {
            const [tab] = nativeTabsFor([tabId]);
            const afterMode = afterTabId >= 0;
            const [target] = nativeTabsFor([afterMode ? afterTabId : beforeTabId]);
            if (!tab || !target || tab === target) {
              throw new Error("Pick a different tab to move next to.");
            }
            const win = windowForTabs([tab, target]);
            ensureMovable([tab]);
            if (tab.getAttribute("zen-workspace-id") !== target.getAttribute("zen-workspace-id")) {
              throw new Error(
                "Both tabs must be in the same space. Move the tab to that space first.",
              );
            }

            // moveTabBefore/After handle forward index shifts, the pinned/unpinned
            // boundary, essentials and folder edges; moveTabTo with a raw index does not.
            if (afterMode) {
              win.gBrowser.moveTabAfter(tab, target);
            } else {
              win.gBrowser.moveTabBefore(tab, target);
            }
            return true;
          } catch (error) {
            throw new Error(`moveTab failed: ${formatError(error)}`);
          }
        },

        async createSpace(name, anchorTabId = -1) {
          try {
            const zenWorkspaces = await zenWorkspacesOf(getWin(anchorTabId));
            const label = cleanName(name, "Space");
            if (typeof zenWorkspaces.createAndSaveWorkspace !== "function") {
              throw new Error("Zen cannot create spaces in this window.");
            }
            // dontChange keeps MCP from stealing the active space; saveWorkspace
            // still creates the space's tab strip via workspace propagation.
            const workspace = await zenWorkspaces.createAndSaveWorkspace(label, undefined, true);
            if (!workspace?.uuid) {
              throw new Error("Could not create space.");
            }
            if (workspace.name !== label) {
              workspace.name = label;
              zenWorkspaces.saveWorkspace(workspace);
            }
            return String(workspace.uuid);
          } catch (error) {
            throw new Error(`createSpace failed: ${formatError(error)}`);
          }
        },

        async renameSpace(spaceId, name) {
          try {
            const label = cleanName(name, "");
            if (!label) {
              throw new Error("Space name cannot be empty.");
            }
            const zenWorkspaces = await zenWorkspacesOf(getWin());
            const workspace = zenWorkspaces.getWorkspaceFromId(spaceId);
            if (!workspace) {
              throw new Error(`Space not found: ${spaceId}`);
            }
            workspace.name = label;
            zenWorkspaces.saveWorkspace(workspace);
            return true;
          } catch (error) {
            throw new Error(`renameSpace failed: ${formatError(error)}`);
          }
        },

        async moveFolder(folderId, spaceId = "", parentId = "", afterFolderId = "") {
          try {
            const { win, folder } = findFolder(folderId);
            const zenWorkspaces = await zenWorkspacesOf(win);

            let parent = null;
            if (parentId) {
              const found = findFolder(parentId);
              if (found.win !== win) {
                throw new Error("Folder and parent must be in the same Zen window.");
              }
              parent = found.folder;
            }

            let after = null;
            if (afterFolderId) {
              const found = findFolder(afterFolderId);
              if (found.win !== win) {
                throw new Error("Folders must be in the same Zen window.");
              }
              after = found.folder;
              if (after === folder) {
                throw new Error("Pick a different folder to move next to.");
              }
            }

            const parentSpace = parent ? String(parent.getAttribute("zen-workspace-id") || "") : "";
            const afterSpace = after ? String(after.getAttribute("zen-workspace-id") || "") : "";
            const currentSpace = String(folder.getAttribute("zen-workspace-id") || "");
            const targetSpace = spaceId || parentSpace || afterSpace || currentSpace;
            if (!targetSpace || !zenWorkspaces.getWorkspaceFromId(targetSpace)) {
              throw new Error(`Space not found: ${spaceId || targetSpace}`);
            }
            if (parentSpace && parentSpace !== targetSpace) {
              throw new Error("Parent folder is not in the target space.");
            }
            if (parent && isFolderOrAncestor(folder, parent)) {
              throw new Error("Cannot move a folder into itself or a descendant.");
            }
            if (parent && typeof parent.level === "number" && parent.level >= 4) {
              throw new Error("Cannot nest a folder any deeper.");
            }

            if (targetSpace !== currentSpace && win.gZenFolders?.changeFolderToSpace) {
              // hasDndSwitch updates workspace ids without switching the active space.
              win.gZenFolders.changeFolderToSpace(folder, targetSpace, { hasDndSwitch: true });
            }
            folder.setAttribute("zen-workspace-id", targetSpace);

            const workspaceElement = zenWorkspaces.workspaceElement?.(targetSpace);
            placeFolder(folder, {
              parent,
              after,
              pinnedContainer: workspaceElement?.pinnedTabsContainer,
            });
            return true;
          } catch (error) {
            throw new Error(`moveFolder failed: ${formatError(error)}`);
          }
        },

        async deleteFolder(folderIds = []) {
          try {
            const folders = folderIds.map((folderId) => findFolder(folderId).folder);
            const leftover = folders.find((folder) => folderHasContent(folder));
            if (leftover) {
              throw new Error(
                `Folder "${leftover.label || leftover.id}" is not empty. Move its tabs and subfolders out first.`,
              );
            }
            const missingDelete = folders.find((folder) => typeof folder.delete !== "function");
            if (missingDelete) {
              throw new Error("Folder cannot be deleted.");
            }
            // Nested empty folders: innermost first so a parent is empty when its turn comes.
            folders.sort((left, right) => folderDepth(right) - folderDepth(left));
            for (const folder of folders) {
              await folder.delete();
            }
            return folders.length;
          } catch (error) {
            throw new Error(`deleteFolder failed: ${formatError(error)}`);
          }
        },

        async deleteSpace(spaceIds = [], anchorTabId = -1) {
          try {
            const zenWorkspaces = await zenWorkspacesOf(getWin(anchorTabId));
            if (typeof zenWorkspaces.removeWorkspace !== "function") {
              throw new Error("Zen cannot delete spaces in this window.");
            }
            const uniqueIds = [...new Set(spaceIds.filter((id) => typeof id === "string" && id))];
            if (!uniqueIds.length) {
              throw new Error("No spaces to delete.");
            }
            const existing = zenWorkspaces.getWorkspaces();
            for (const spaceId of uniqueIds) {
              if (!zenWorkspaces.getWorkspaceFromId(spaceId)) {
                throw new Error(`Space not found: ${spaceId}`);
              }
            }
            if (existing.length - uniqueIds.length < 1) {
              throw new Error("Cannot delete every space. Leave at least one.");
            }
            for (const spaceId of uniqueIds) {
              await zenWorkspaces.removeWorkspace(spaceId);
            }
            return uniqueIds.length;
          } catch (error) {
            throw new Error(`deleteSpace failed: ${formatError(error)}`);
          }
        },

        async setEssential(tabIds = []) {
          try {
            const tabs = nativeTabsFor(tabIds);
            const win = windowForTabs(tabs);
            if (!win?.gZenPinnedTabManager?.addToEssentials) {
              throw new Error("Zen essentials are not available in this window.");
            }
            const pending = tabs.filter((tab) => tab.getAttribute("zen-essential") !== "true");
            if (!pending.length) {
              return tabs.length;
            }
            const moved = win.gZenPinnedTabManager.addToEssentials(pending);
            if (moved === false) {
              throw new Error("One or more tabs cannot be made essential.");
            }
            return tabs.length;
          } catch (error) {
            throw new Error(`setEssential failed: ${formatError(error)}`);
          }
        },

        async clearEssential(tabIds = []) {
          try {
            const tabs = nativeTabsFor(tabIds);
            for (const tab of tabs) {
              if (tab.getAttribute("zen-essential") !== "true") {
                continue;
              }
              const win = chromeWindowForNativeTab(tab);
              if (!win?.gZenPinnedTabManager?.removeEssentials) {
                throw new Error("Zen essentials are not available in this window.");
              }
              win.gZenPinnedTabManager.removeEssentials(tab);
            }
            return tabs.length;
          } catch (error) {
            throw new Error(`clearEssential failed: ${formatError(error)}`);
          }
        },
      }),
    };
  }
};
