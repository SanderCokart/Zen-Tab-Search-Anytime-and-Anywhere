import { render } from "preact";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DISPLAY_SETTINGS } from "@/features/settings/model/display-settings";
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

    await vi.waitFor(() => expect(root.textContent).toContain("Settings"));
    const colorButton = root.querySelector<HTMLButtonElement>(
      "button[aria-label='Choose text color']",
    );
    await vi.waitFor(() => expect(colorButton?.disabled).toBe(false));
    colorButton?.click();
    await vi.waitFor(() => expect(document.querySelector(".pcr-app")).toBeTruthy());
    expect(document.querySelector(".pcr-type[data-type='HEXA']")).toBeTruthy();
    expect(document.querySelector(".pcr-type[data-type='RGBA']")).toBeTruthy();
    expect(document.querySelector(".pcr-type[data-type='HSLA']")).toBeTruthy();
    const folders = root.querySelector<HTMLInputElement>("[data-testid='zen-groupFolders']")!;
    const subfolders = root.querySelector<HTMLInputElement>("[data-testid='zen-groupSubfolders']")!;
    await vi.waitFor(() => expect(folders.disabled).toBe(false));
    folders.click();

    await vi.waitFor(() => expect(subfolders.disabled).toBe(true));
    expect(set).toHaveBeenCalledWith({
      displaySettings: {
        detectForgeIssues: true,
        filterIssuesInOverlay: true,
        groupFolders: false,
        groupSubfolders: false,
        hideSpacesInPopup: false,
        hideSpacesInOverlay: false,
        hideEssentialsInPopup: false,
        hideEssentialsInOverlay: false,
        fontSize: 14,
        uiScale: 1,
        respectZoom: false,
        truncateTabTitles: true,
        truncateIssueTitles: true,
        sectionGap: 20,
        tabGap: 4,
        folderGap: 12,
        essentialGap: 8,
        spaceGap: 8,
        issueGap: 4,
        todoGap: 4,
        reuseExternalTabs: false,
        soundEnabled: true,
        soundVolume: 0.4,
        theme: "system",
        textColor: "auto",
        issueBackgroundColor: "auto",
        folderBackgroundColor: "auto",
        spaceBackgroundColor: "auto",
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

    const detect = await vi.waitFor(() => {
      const input = root.querySelector<HTMLInputElement>("[data-testid='zen-detectForgeIssues']");
      expect(input?.disabled).toBe(false);
      return input!;
    });
    const overlayOnly = root.querySelector<HTMLInputElement>(
      "[data-testid='zen-filterIssuesInOverlay']",
    )!;
    detect.click();

    await vi.waitFor(() => expect(overlayOnly.disabled).toBe(true));
    expect(set).toHaveBeenCalledWith({
      displaySettings: {
        detectForgeIssues: false,
        filterIssuesInOverlay: false,
        groupFolders: true,
        groupSubfolders: true,
        hideSpacesInPopup: false,
        hideSpacesInOverlay: false,
        hideEssentialsInPopup: false,
        hideEssentialsInOverlay: false,
        fontSize: 14,
        uiScale: 1,
        respectZoom: false,
        truncateTabTitles: true,
        truncateIssueTitles: true,
        sectionGap: 20,
        tabGap: 4,
        folderGap: 12,
        essentialGap: 8,
        spaceGap: 8,
        issueGap: 4,
        todoGap: 4,
        reuseExternalTabs: false,
        soundEnabled: true,
        soundVolume: 0.4,
        theme: "system",
        textColor: "auto",
        issueBackgroundColor: "auto",
        folderBackgroundColor: "auto",
        spaceBackgroundColor: "auto",
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
          hideSpacesInPopup: false,
          hideSpacesInOverlay: false,
          hideEssentialsInPopup: false,
          hideEssentialsInOverlay: false,
          fontSize: 14,
          uiScale: 1,
          respectZoom: false,
          truncateTabTitles: true,
          truncateIssueTitles: true,
          sectionGap: 20,
          tabGap: 4,
          folderGap: 12,
          essentialGap: 8,
          spaceGap: 8,
          issueGap: 4,
          todoGap: 4,
          reuseExternalTabs: false,
          soundEnabled: true,
          soundVolume: 0.4,
          theme: "system",
          textColor: "auto",
          issueBackgroundColor: "auto",
          folderBackgroundColor: "auto",
          spaceBackgroundColor: "auto",
        },
      }),
    );

    render(null, root);
    root.remove();
  });

  it("saves a popup-only spaces hide without changing the omnibar", async () => {
    const set = vi.fn(async () => undefined);
    Object.assign(globalThis, {
      browser: {
        storage: {
          local: {
            get: vi.fn(async () => ({ displaySettings: {} })),
            set,
          },
          onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      },
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(<DisplaySettingsApp />, root);

    const checkbox = await vi.waitFor(() => {
      const input = root.querySelector<HTMLInputElement>("[data-testid='zen-hideSpacesInPopup']");
      expect(input?.disabled).toBe(false);
      return input!;
    });
    checkbox.click();

    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith({
        displaySettings: {
          ...DEFAULT_DISPLAY_SETTINGS,
          hideSpacesInPopup: true,
        },
      }),
    );

    render(null, root);
    root.remove();
  });

  it("saves external tab reuse only after the switch is turned on", async () => {
    const set = vi.fn(async () => undefined);
    Object.assign(globalThis, {
      browser: {
        storage: {
          local: {
            get: vi.fn(async () => ({ displaySettings: {} })),
            set,
          },
          onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      },
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(<DisplaySettingsApp />, root);

    const checkbox = await vi.waitFor(() => {
      const input = root.querySelector<HTMLInputElement>("[data-testid='zen-reuseExternalTabs']");
      expect(input?.disabled).toBe(false);
      expect(input?.checked).toBe(false);
      return input!;
    });
    checkbox.click();

    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith({
        displaySettings: {
          ...DEFAULT_DISPLAY_SETTINGS,
          reuseExternalTabs: true,
        },
      }),
    );

    render(null, root);
    root.remove();
  });

  it("saves the theme picked in the segmented control", async () => {
    const set = vi.fn(async () => undefined);
    Object.assign(globalThis, {
      browser: {
        storage: {
          local: {
            get: vi.fn(async () => ({ displaySettings: {} })),
            set,
          },
          onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      },
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(<DisplaySettingsApp />, root);

    const dark = await vi.waitFor(() => {
      const button = root.querySelector<HTMLButtonElement>(
        "[role='radiogroup'][aria-label='Theme'] [role='radio']:nth-child(3)",
      );
      expect(button?.disabled).toBe(false);
      return button!;
    });
    expect(
      root.querySelector("[role='radiogroup'][aria-label='Theme'] [aria-checked='true']")
        ?.textContent,
    ).toBe("System");
    dark.click();

    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith({
        displaySettings: { ...DEFAULT_DISPLAY_SETTINGS, theme: "dark" },
      }),
    );
    expect(root.querySelector("main")?.getAttribute("data-theme")).toBe("dark");

    render(null, root);
    root.remove();
  });
});
