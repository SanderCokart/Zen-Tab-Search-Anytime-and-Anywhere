import { render } from "preact";
import { describe, expect, it, vi } from "vitest";
import { DisplaySettingsApp } from "@/features/settings/ui/DisplaySettingsApp";

describe("DisplaySettingsApp", () => {
  it("disables subfolder grouping when folder grouping is disabled", async () => {
    const set = vi.fn(async () => undefined);
    Object.assign(globalThis, {
      browser: {
        storage: {
          local: {
            get: vi.fn(async () => ({
              displaySettings: {
                detectForgeIssues: true,
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
    const colorButton = root.querySelector<HTMLButtonElement>(
      "button[aria-label='Choose text color']",
    );
    await vi.waitFor(() => expect(colorButton?.disabled).toBe(false));
    colorButton?.click();
    await vi.waitFor(() => expect(document.querySelector(".pcr-app")).toBeTruthy());
    expect(document.querySelector(".pcr-type[data-type='HEXA']")).toBeTruthy();
    expect(document.querySelector(".pcr-type[data-type='RGBA']")).toBeTruthy();
    expect(document.querySelector(".pcr-type[data-type='HSLA']")).toBeTruthy();
    const checkboxes = root.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(checkboxes).toHaveLength(4);
    await vi.waitFor(() => expect(checkboxes[2]?.disabled).toBe(false));
    checkboxes[2]?.click();

    await vi.waitFor(() => expect(checkboxes[3]?.disabled).toBe(true));
    expect(set).toHaveBeenCalledWith({
      displaySettings: {
        detectForgeIssues: true,
        filterIssuesInOverlay: true,
        groupFolders: false,
        groupSubfolders: false,
        textColor: "#f5f5f5",
        issueBackgroundColor: "#252525",
        folderBackgroundColor: "#2d2d2d",
        spaceBackgroundColor: "#292929",
      },
    });

    render(null, root);
    root.remove();
  });

  it("disables overlay-only issues when issue detection is disabled", async () => {
    const set = vi.fn(async () => undefined);
    Object.assign(globalThis, {
      browser: {
        storage: {
          local: {
            get: vi.fn(async () => ({
              displaySettings: {
                detectForgeIssues: true,
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

    const checkboxes = await vi.waitFor(() => {
      const inputs = root.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
      expect(inputs).toHaveLength(4);
      expect(inputs[0]?.disabled).toBe(false);
      return inputs;
    });
    checkboxes[0]?.click();

    await vi.waitFor(() => expect(checkboxes[1]?.disabled).toBe(true));
    expect(set).toHaveBeenCalledWith({
      displaySettings: {
        detectForgeIssues: false,
        filterIssuesInOverlay: false,
        groupFolders: true,
        groupSubfolders: true,
        textColor: "#f5f5f5",
        issueBackgroundColor: "#252525",
        folderBackgroundColor: "#2d2d2d",
        spaceBackgroundColor: "#292929",
      },
    });

    render(null, root);
    root.remove();
  });

  it("resets a color to its default", async () => {
    const set = vi.fn(async () => undefined);
    Object.assign(globalThis, {
      browser: {
        storage: {
          local: {
            get: vi.fn(async () => ({
              displaySettings: {
                detectForgeIssues: true,
                filterIssuesInOverlay: true,
                groupFolders: true,
                groupSubfolders: true,
                textColor: "#ff0000",
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

    const reset = await vi.waitFor(() => {
      const button = root.querySelector<HTMLButtonElement>("button[aria-label='Reset text color']");
      expect(button?.disabled).toBe(false);
      return button!;
    });
    reset.click();

    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith({
        displaySettings: {
          detectForgeIssues: true,
          filterIssuesInOverlay: true,
          groupFolders: true,
          groupSubfolders: true,
          textColor: "#f5f5f5",
          issueBackgroundColor: "#252525",
          folderBackgroundColor: "#2d2d2d",
          spaceBackgroundColor: "#292929",
        },
      }),
    );

    render(null, root);
    root.remove();
  });
});
