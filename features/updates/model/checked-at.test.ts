import { describe, expect, it } from "vitest";
import { formatLastChecked } from "@/features/updates/model/checked-at";

const now = 10 * 24 * 60 * 60_000;

describe("formatLastChecked", () => {
  it.each([
    [null, "Not checked yet"],
    [now - 20_000, "Last checked just now"],
    [now - 60_000, "Last checked 1 minute ago"],
    [now - 59 * 60_000, "Last checked 59 minutes ago"],
    [now - 5 * 60 * 60_000, "Last checked 5 hours ago"],
    [now - 3 * 24 * 60 * 60_000, "Last checked 3 days ago"],
  ])("formats %s", (checkedAt, expected) => {
    expect(formatLastChecked(checkedAt, now)).toBe(expected);
  });
});
