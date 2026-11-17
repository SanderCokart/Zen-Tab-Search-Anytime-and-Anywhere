import { describe, expect, it } from "vitest";
import {
  applyEssentialTabNames,
  parseEssentialTabNames,
} from "@/features/search/model/essential-tab-names";
import type { TabInfo } from "@/shared/types";

function tab(partial: Partial<TabInfo> & Pick<TabInfo, "id">): TabInfo {
  return {
    title: "Tab",
    url: "https://example.com",
    favIconUrl: "",
    windowId: 1,
    ...partial,
  };
}

describe("parseEssentialTabNames", () => {
  it("keeps only string names", () => {
    expect(parseEssentialTabNames({ "tab-1": "Inbox", "tab-2": 3, nested: { a: "b" } })).toEqual({
      "tab-1": "Inbox",
    });
    expect(parseEssentialTabNames(null)).toEqual({});
    expect(parseEssentialTabNames("Inbox")).toEqual({});
  });
});

describe("applyEssentialTabNames", () => {
  it("labels essential tabs by DOM id and leaves ordinary tabs alone", () => {
    const tabs = [
      tab({ id: 1, essential: true, domId: "ess-1", title: "Mail" }),
      tab({ id: 2, essential: true, domId: "ess-2", title: "Chat" }),
      tab({ id: 3, title: "Docs", customLabel: "Handbook" }),
    ];
    expect(applyEssentialTabNames(tabs, { "ess-1": "Inbox" })).toEqual([
      expect.objectContaining({ id: 1, customLabel: "Inbox" }),
      expect.objectContaining({ id: 2, title: "Chat" }),
      expect.objectContaining({ id: 3, customLabel: "Handbook" }),
    ]);
  });
});
