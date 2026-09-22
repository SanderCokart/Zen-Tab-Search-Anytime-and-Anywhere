import { describe, expect, it } from "vitest";
import {
  findReusableTab,
  normalizeComparableUrl,
  type ReusableTab,
} from "@/features/intercept/model/reuse-url";

const ISSUE = "https://gitlab.example.com/group/app/-/issues/42";

function tab(partial: Partial<ReusableTab> & Pick<ReusableTab, "id" | "url">): ReusableTab {
  return { ...partial };
}

describe("normalizeComparableUrl", () => {
  it("ignores fragments, trailing slashes, and mail tracking params", () => {
    expect(normalizeComparableUrl(`${ISSUE}/#note_9`)).toBe(ISSUE);
    expect(normalizeComparableUrl(`${ISSUE}?utm_source=email&utm_medium=mail`)).toBe(ISSUE);
    expect(normalizeComparableUrl(`${ISSUE}?b=2&a=1`)).toBe(`${ISSUE}?a=1&b=2`);
  });

  it("unwraps Outlook safelinks and Gmail redirects", () => {
    const safelink = `https://nam12.safelinks.protection.outlook.com/?url=${encodeURIComponent(ISSUE)}`;
    const gmail = `https://www.google.com/url?q=${encodeURIComponent(ISSUE)}`;
    expect(normalizeComparableUrl(safelink)).toBe(ISSUE);
    expect(normalizeComparableUrl(gmail)).toBe(ISSUE);
  });

  it("rejects empty and non-web URLs", () => {
    expect(normalizeComparableUrl("")).toBeNull();
    expect(normalizeComparableUrl("about:blank")).toBeNull();
    expect(normalizeComparableUrl("moz-extension://abc/popup.html")).toBeNull();
  });
});

describe("findReusableTab", () => {
  it("returns the most recently used tab with the same URL", () => {
    const match = findReusableTab(
      [
        tab({ id: 8, url: ISSUE, lastOpenedAt: 10 }),
        tab({ id: 4, url: `${ISSUE}?utm_source=email#note_1`, lastOpenedAt: 30 }),
        tab({ id: 9, url: ISSUE, lastOpenedAt: 20 }),
      ],
      9,
      ISSUE,
    );

    expect(match?.id).toBe(4);
  });

  it("can focus an essential tab that has no extension id", () => {
    const match = findReusableTab([tab({ id: -1, domId: "essential-1", url: ISSUE })], 12, ISSUE);

    expect(match).toMatchObject({ id: -1, domId: "essential-1" });
  });

  it("returns nothing when the URL is new", () => {
    expect(
      findReusableTab(
        [tab({ id: 1, url: "https://gitlab.example.com/group/app/-/issues/7" })],
        3,
        ISSUE,
      ),
    ).toBeUndefined();
  });
});
