import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "@/shared/ui/lib/copy-text";

describe("copyText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes through the Clipboard API", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await copyText("https://example.com/issue");
    expect(writeText).toHaveBeenCalledWith("https://example.com/issue");
  });

  it("falls back to a hidden field when the Clipboard API rejects", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });
    const execCommand = vi.fn(() => true);
    vi.stubGlobal("document", document);
    document.execCommand = execCommand as typeof document.execCommand;
    await copyText("https://example.org");
    expect(execCommand).toHaveBeenCalledWith("copy");
  });
});
