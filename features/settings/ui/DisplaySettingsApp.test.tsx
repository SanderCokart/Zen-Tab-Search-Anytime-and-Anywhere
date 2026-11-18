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
        ...DEFAULT_DISPLAY_SETTINGS,
        detectForgeIssues: true,
        filterIssuesInOverlay: true,
        filterRequestsInOverlay: true,
        groupFolders: false,
        groupSubfolders: false,
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
    const requestsOnly = root.querySelector<HTMLInputElement>(
      "[data-testid='zen-filterRequestsInOverlay']",
    )!;
    detect.click();

    await vi.waitFor(() => expect(overlayOnly.disabled).toBe(true));
    expect(requestsOnly.disabled).toBe(true);
    expect(set).toHaveBeenCalledWith({
      displaySettings: {
        ...DEFAULT_DISPLAY_SETTINGS,
        detectForgeIssues: false,
        filterIssuesInOverlay: false,
        filterRequestsInOverlay: false,
        groupFolders: true,
        groupSubfolders: true,
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
          ...DEFAULT_DISPLAY_SETTINGS,
          detectForgeIssues: true,
          filterIssuesInOverlay: true,
          filterRequestsInOverlay: true,
          groupFolders: true,
          groupSubfolders: true,
          textColor: "auto",
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
      const input = root.querySelector<HTMLInputElement>("[data-testid='zen-hideSpacesInOverlay']");
      expect(input?.disabled).toBe(false);
      return input!;
    });
    checkbox.click();

    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith({
        displaySettings: {
          ...DEFAULT_DISPLAY_SETTINGS,
          hideSpacesInOverlay: true,
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

  it("turns the omnibar background down from the opacity dial", async () => {
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

    const dial = await vi.waitFor(() => {
      const element = root.querySelector<HTMLElement>("[data-testid='zen-background-opacity']");
      expect(element?.getAttribute("aria-disabled")).not.toBe("true");
      return element!;
    });
    expect(dial.getAttribute("aria-valuemin")).toBe("0");
    expect(dial.getAttribute("aria-valuemax")).toBe("1");
    expect(dial.getAttribute("aria-valuenow")).toBe("0.75");
    dial.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));

    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith({
        displaySettings: { ...DEFAULT_DISPLAY_SETTINGS, backgroundOpacity: 0.7 },
      }),
    );

    render(null, root);
    root.remove();
  });

  it("asks once, then wipes extension data", async () => {
    const sendMessage = vi.fn(async () => undefined);
    Object.assign(globalThis, {
      browser: {
        runtime: { sendMessage },
        storage: {
          local: {
            get: vi.fn(async () => ({ displaySettings: {} })),
            set: vi.fn(async () => undefined),
          },
          onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      },
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(<DisplaySettingsApp />, root);

    const button = await vi.waitFor(() => {
      const element = root.querySelector<HTMLButtonElement>("[data-testid='zen-wipe-data']");
      expect(element).not.toBeNull();
      return element!;
    });
    expect(button.textContent).toBe("Wipe extension data");
    button.click();
    expect(sendMessage).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(button.textContent).toContain("cannot be undone"));
    button.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ type: "resetExtensionData" }),
    );

    render(null, root);
    root.remove();
  });
});
