import { render } from "preact";
import { describe, expect, it, vi } from "vitest";
import { DisplaySettingsApp } from "../ui/settings/DisplaySettingsApp";

describe("DisplaySettingsApp", () => {
  it("disables subfolder grouping when folder grouping is disabled", async () => {
    const set = vi.fn(async () => undefined);
    Object.assign(globalThis, {
      browser: {
        storage: {
          local: {
            get: vi.fn(async () => ({
              displaySettings: {
                filterIssuesInOverlay: true,
                groupFolders: true,
                groupSubfolders: true,
              },
            })),
            set,
          },
          onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      },
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(<DisplaySettingsApp />, root);

    await vi.waitFor(() => expect(root.textContent).toContain("Display options"));
    const checkboxes = root.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(checkboxes).toHaveLength(3);
    await vi.waitFor(() => expect(checkboxes[1]?.disabled).toBe(false));
    checkboxes[1]?.click();

    await vi.waitFor(() => expect(checkboxes[2]?.disabled).toBe(true));
    expect(set).toHaveBeenCalledWith({
      displaySettings: {
        filterIssuesInOverlay: true,
        groupFolders: false,
        groupSubfolders: false,
      },
    });

    render(null, root);
    root.remove();
  });
});
