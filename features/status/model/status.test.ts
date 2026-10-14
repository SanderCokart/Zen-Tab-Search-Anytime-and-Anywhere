import { describe, expect, it } from "vitest";
import { statusesByTabId } from "@/features/status/model/status";

describe("status model", () => {
  it("builds a lookup from the snapshot list", () => {
    const map = statusesByTabId([
      { tabId: 1, light: "red" },
      { tabId: 4, light: "green" },
    ]);
    expect(map.get(1)).toBe("red");
    expect(map.get(4)).toBe("green");
    expect(map.has(2)).toBe(false);
  });
});
