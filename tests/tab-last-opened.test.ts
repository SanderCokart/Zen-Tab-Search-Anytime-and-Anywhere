import { describe, expect, it } from "vitest";
import { mergeTabLastOpened, parseStoredLastOpened } from "../lib/background/tab-last-opened";
import type { TabInfo } from "../lib/types";

function tab(id: number, lastOpenedAt?: number): TabInfo {
  return {
    id,
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
    favIconUrl: "",
    windowId: 1,
    lastOpenedAt,
  };
}

describe("parseStoredLastOpened", () => {
  it("keeps finite timestamps", () => {
    expect(parseStoredLastOpened({ "1": 100, "2": "nope", "3": 0 })).toEqual({ "1": 100 });
  });
});

describe("mergeTabLastOpened", () => {
  it("prefers the newest stored or tab timestamp", () => {
    expect(mergeTabLastOpened([tab(1, 50), tab(2)], { "1": 200, "2": 80 })).toEqual([
      expect.objectContaining({ id: 1, lastOpenedAt: 200 }),
      expect.objectContaining({ id: 2, lastOpenedAt: 80 }),
    ]);
  });
});
