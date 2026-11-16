import { debugWarn } from "@/shared/debug";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { isUsableTabId } from "@/shared/types";
import type { ForgePageInfo } from "@/features/forge/model/forge-label";
import {
  FORGE_TARGET_BRANCHES_STORAGE_KEY,
  forgeRequestKeyForUrl,
  parseStoredTargetBranches,
  rememberTargetBranch,
  type StoredTargetBranches,
} from "@/features/forge/model/target-branch";

/**
 * GitLab and GitHub render the MR/PR header after the page loads, so a page
 * that does not show the branch yet is asked again a few times.
 */
const RETRY_DELAYS_MS = [0, 1_500, 4_000, 10_000];

export function createTargetBranchService(deps: {
  getPageInfo(tabId: number, url: string): Promise<ForgePageInfo>;
  wait?(ms: number): Promise<void>;
  now?(): number;
}) {
  const wait =
    deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? Date.now;
  /** The URL each tab is being read for; a navigation replaces it and ends the old read. */
  const collecting = new Map<number, string>();

  const read = async (): Promise<StoredTargetBranches> => {
    const stored = await browser.storage.local.get(FORGE_TARGET_BRANCHES_STORAGE_KEY);
    return parseStoredTargetBranches(stored[FORGE_TARGET_BRANCHES_STORAGE_KEY]);
  };

  const remember = async (key: string, branch: string): Promise<void> => {
    const next = rememberTargetBranch(await read(), key, branch, now());
    if (next) {
      await browser.storage.local.set({ [FORGE_TARGET_BRANCHES_STORAGE_KEY]: next });
    }
  };

  /** Reads an MR/PR tab's target branch off its page and remembers it. */
  const collect = async (tabId: number, url: string): Promise<void> => {
    const key = forgeRequestKeyForUrl(url);
    if (key === undefined || collecting.get(tabId) === url) {
      return;
    }

    collecting.set(tabId, url);
    try {
      for (const delay of RETRY_DELAYS_MS) {
        await wait(delay);
        if (collecting.get(tabId) !== url) {
          return;
        }
        const info = await deps.getPageInfo(tabId, url);
        // Mid-navigation the previous page can still answer; its branch is not this MR's.
        if (info.targetBranch && forgeRequestKeyForUrl(info.url) === key) {
          await remember(key, info.targetBranch);
          return;
        }
      }
    } finally {
      if (collecting.get(tabId) === url) {
        collecting.delete(tabId);
      }
    }
  };

  return {
    read,
    collect,
    forget: (tabId: number) => {
      collecting.delete(tabId);
    },
  };
}

export type TargetBranchService = ReturnType<typeof createTargetBranchService>;

/** Reads the target branch of every loaded MR/PR tab, and of each one loaded later. */
export function registerTargetBranchCollection(service: TargetBranchService): void {
  const collect = (tabId: number | undefined, url: string | undefined) => {
    if (isUsableTabId(tabId) && url) {
      void service.collect(tabId, url).catch((error) => {
        debugWarn(`${LOG_PREFIX} Could not read the MR/PR target branch:`, formatError(error));
      });
    }
  };

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // GitHub navigates between pages without a load, so a URL change counts too.
    if (changeInfo.status === "complete" || changeInfo.url) {
      collect(tabId, tab.url ?? changeInfo.url);
    }
  });
  browser.tabs.onRemoved.addListener((tabId) => service.forget(tabId));
  void browser.tabs
    .query({ discarded: false })
    .then((tabs) => tabs.forEach((tab) => collect(tab.id, tab.url)))
    .catch((error) => {
      debugWarn(`${LOG_PREFIX} Could not list tabs for MR/PR target branches:`, formatError(error));
    });
}
