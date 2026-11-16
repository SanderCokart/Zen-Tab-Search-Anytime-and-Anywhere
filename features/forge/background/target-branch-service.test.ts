import { afterEach, describe, expect, it, vi } from "vitest";
import { createTargetBranchService } from "@/features/forge/background/target-branch-service";
import { FORGE_TARGET_BRANCHES_STORAGE_KEY } from "@/features/forge/model/target-branch";
import type { ForgePageInfo } from "@/features/forge/model/forge-label";

const MR_URL = "https://gitlab.com/acme/app/-/merge_requests/12";
const MR_KEY = "gitlab.com/acme/app/merge_request/12";

/** A stand-in for `browser.storage.local`. */
function stubStorage(initial: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { ...initial };
  const set = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(values, items);
  });
  Object.assign(globalThis, {
    browser: {
      storage: {
        local: {
          get: vi.fn(async (key: string) => (key in values ? { [key]: values[key] } : {})),
          set,
        },
      },
    },
  });
  return { values, set };
}

function service(pages: ForgePageInfo[]) {
  const getPageInfo = vi.fn(async () => pages.shift() ?? {});
  return {
    getPageInfo,
    service: createTargetBranchService({ getPageInfo, wait: async () => {}, now: () => 50 }),
  };
}

describe("target branch service", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "browser");
  });

  it("asks again until the page shows the branch, then remembers it", async () => {
    const { values } = stubStorage();
    const { getPageInfo, service: branches } = service([
      { url: MR_URL },
      { url: MR_URL, targetBranch: "main" },
    ]);

    await branches.collect(4, MR_URL);

    expect(getPageInfo).toHaveBeenCalledTimes(2);
    expect(values[FORGE_TARGET_BRANCHES_STORAGE_KEY]).toEqual({
      [MR_KEY]: { branch: "main", savedAt: 50 },
    });
    await expect(branches.read()).resolves.toEqual({ [MR_KEY]: { branch: "main", savedAt: 50 } });
  });

  it("ignores an answer from the page the tab is navigating away from", async () => {
    const { set } = stubStorage();
    const { service: branches } = service([
      { url: "https://gitlab.com/acme/app/-/merge_requests/11", targetBranch: "develop" },
    ]);

    await branches.collect(4, MR_URL);

    expect(set).not.toHaveBeenCalled();
  });

  it("does not write when the branch is unchanged", async () => {
    const { set } = stubStorage({
      [FORGE_TARGET_BRANCHES_STORAGE_KEY]: { [MR_KEY]: { branch: "main", savedAt: 1 } },
    });
    const { service: branches } = service([{ url: MR_URL, targetBranch: "main" }]);

    await branches.collect(4, MR_URL);

    expect(set).not.toHaveBeenCalled();
  });

  it("skips issues and other pages", async () => {
    stubStorage();
    const { getPageInfo, service: branches } = service([]);

    await branches.collect(4, "https://gitlab.com/acme/app/-/issues/3");

    expect(getPageInfo).not.toHaveBeenCalled();
  });
});
