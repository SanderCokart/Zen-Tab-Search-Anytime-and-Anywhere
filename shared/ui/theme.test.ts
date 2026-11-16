import { describe, expect, it } from "vitest";
import { resolveTheme } from "@/shared/ui/theme";

describe("resolveTheme", () => {
  it("follows the system while the preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("holds a fixed preference whatever the system says", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
