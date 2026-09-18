import { describe, expect, it } from "vitest";
import { entryTextClass } from "@/features/search/ui/lib/styles";

describe("entryTextClass", () => {
  it("cuts entry text to one line when truncation is on", () => {
    expect(entryTextClass(true)).toBe("truncate");
  });

  it("lets entry text wrap when truncation is off", () => {
    // `truncate` implies whitespace-nowrap, so it has to go entirely rather than
    // being combined with a wrapping class.
    expect(entryTextClass(false)).not.toContain("truncate");
    expect(entryTextClass(false)).toBe("break-words");
  });
});
