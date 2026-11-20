import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

const screenshotsRoot = path.join(
  fileURLToPath(new URL("..", import.meta.url)),
  "docs",
  "screenshots",
);

/**
 * Every capture runs once per colour scheme. The display theme defaults to
 * "system", so the browser's colour scheme decides which theme renders. Light
 * keeps the bare file names; dark goes to `dark/` with the same names.
 */
const THEMES = [
  { name: "light", colorScheme: "light", outputDir: screenshotsRoot },
  { name: "dark", colorScheme: "dark", outputDir: path.join(screenshotsRoot, "dark") },
] as const;

type Capture = {
  scene: string;
  file: string;
  ready?: (page: Page) => Promise<void>;
  after?: (page: Page) => Promise<void>;
  fullPage?: boolean;
  clip?: "omnibar" | "popup" | "card";
  locator?: string;
  /** Clips to the box around every element the selector matches, plus a margin. */
  around?: string;
};

async function waitForSearch(page: Page, overlay: boolean) {
  await page.locator("[data-testid='zen-search-input']").waitFor();
  if (overlay) {
    await page.locator("[data-omnibar-stage='open']").waitFor();
  }
  await expect(page.locator("[data-testid='zen-search-item']").first()).toBeAttached();
}

async function tabRow(page: Page) {
  const row = page.getByRole("option", { name: /Architecture guide/ });
  await row.scrollIntoViewIfNeeded();
  return row;
}

/** Outlines a control so a screenshot shows where to find it. */
async function highlight(target: Locator) {
  await target.evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.style.outline = "3px solid #f97316";
      element.style.outlineOffset = "-3px";
    }
  });
}

const captures: Capture[] = [
  {
    scene: "search-omnibar",
    file: "search-omnibar.png",
    ready: (page) => waitForSearch(page, true),
    clip: "omnibar",
  },
  {
    scene: "concept-simple",
    file: "concept-simple.png",
    ready: async (page) => {
      await waitForSearch(page, true);
      await expect(page.locator("[data-testid='zen-space-section']")).toHaveCount(0);
      await expect(page.locator("[data-testid='zen-essential-section']")).toHaveCount(0);
    },
    clip: "omnibar",
  },
  {
    scene: "concept-simple-forge",
    file: "concept-simple-forge.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      const input = page.locator("[data-testid='zen-search-input']");
      await input.fill("!");
      await expect(page.getByText("Host override proxy").first()).toBeVisible();
      // Prefix filtering of the tab list lands later; hide non-request rows so
      // this concept shot matches the intended Simple + ! list.
      await page.evaluate(() => {
        for (const item of document.querySelectorAll("[data-testid='zen-search-item']")) {
          const text = item.textContent ?? "";
          if (!/PR:|MR:/.test(text)) {
            (item as HTMLElement).style.display = "none";
          }
        }
      });
    },
    clip: "omnibar",
  },
  {
    scene: "concept-enhanced",
    file: "concept-enhanced.png",
    ready: async (page) => {
      await waitForSearch(page, true);
      await expect(page.locator("[data-testid='zen-space-section']")).toHaveCount(0);
      await expect(page.locator("[data-testid='zen-essential-section']")).toHaveCount(0);
      await expect(page.locator("button[aria-label='Show active timers']")).toBeVisible();
    },
    clip: "omnibar",
  },
  {
    scene: "concept-enhanced-timers",
    file: "concept-enhanced-timers.png",
    ready: async (page) => {
      await page.locator("[data-testid='zen-search-input']").waitFor();
      await page.locator("[data-omnibar-stage='open']").waitFor();
      await expect(page.getByText("Active timers")).toBeVisible();
    },
    clip: "omnibar",
  },
  {
    scene: "concept-pro",
    file: "concept-pro.png",
    ready: async (page) => {
      await waitForSearch(page, true);
      await expect(page.locator("[data-testid='zen-todo-column']")).toBeVisible();
      await expect(page.locator("[data-testid='zen-issue-entry']")).toHaveCount(0);
    },
    clip: "omnibar",
  },
  {
    scene: "concept-dev&busy=1",
    file: "organize-issue-tabs.png",
    ready: async (page) => {
      await waitForSearch(page, true);
      await expect(page.locator("[data-testid='zen-issue-entry']").first()).toBeVisible();
    },
    after: async (page) => {
      await page.locator("[data-testid='zen-organize-forge']").click();
      await page.locator("[data-testid='zen-organize-forge-by-issue']").hover();
      await expect(page.locator("[data-testid='zen-organize-forge-preview']")).toBeVisible();
    },
    clip: "omnibar",
  },
  {
    scene: "concept-dev&busy=1",
    file: "todo-reorder.png",
    ready: async (page) => {
      await waitForSearch(page, true);
      await expect(page.locator("[data-testid='zen-todo-row']").nth(3)).toBeVisible();
    },
    locator: "[data-testid='zen-todo-column']",
  },
  {
    scene: "concept-dev",
    file: "concept-dev.png",
    ready: async (page) => {
      await waitForSearch(page, true);
      await expect(page.locator("[data-testid='zen-issue-entry']").first()).toBeVisible();
      await expect(page.locator("[data-testid='zen-todo-column']")).toBeVisible();
    },
    clip: "omnibar",
  },
  {
    scene: "search-popup",
    file: "search-popup.png",
    ready: (page) => waitForSearch(page, false),
    clip: "popup",
  },
  {
    scene: "search-omnibar",
    file: "search-query-help.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      await page.getByTestId("zen-search-help").hover();
      await expect(page.locator("[role='tooltip']")).toBeVisible();
      await page.waitForTimeout(1200);
    },
    around: ".zs-search-lcd, [role='tooltip']",
  },
  {
    scene: "search-omnibar",
    file: "todo-clear-menu.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      await page.getByTestId("zen-todo-clear").click();
      await expect(page.getByTestId("zen-todo-clear-menu")).toBeVisible();
    },
    around: "[data-testid='zen-todo-column']",
  },
  {
    scene: "concept-simple",
    file: "search-query-exclude.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      const input = page.locator("[data-testid='zen-search-input']");
      await input.fill("-gitlab");
      await expect(page.getByRole("option", { name: /Improve tab search/ })).toBeVisible();
      await expect(page.getByRole("option", { name: /Fix the search results/ })).toHaveCount(0);
    },
    clip: "omnibar",
  },
  {
    scene: "search-omnibar",
    file: "search-query.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      const input = page.locator("[data-testid='zen-search-input']");
      await input.fill("gitlab");
      await expect(page.getByText("Fix the search results").first()).toBeVisible();
    },
    clip: "omnibar",
  },
  {
    scene: "omnibar-shape",
    file: "omnibar-shape.png",
    ready: async (page) => {
      await waitForSearch(page, true);
      await expect(page.locator("[data-testid='zen-issue-entry']").first()).toBeVisible();
      await expect(page.locator("[data-testid='zen-todo-column']")).toBeVisible();
    },
    clip: "omnibar",
  },
  {
    scene: "hide-spaces-and-essentials",
    file: "hide-spaces-and-essentials.png",
    ready: async (page) => {
      await waitForSearch(page, true);
      await expect(page.locator("[data-testid='zen-space-section']")).toHaveCount(0);
      await expect(page.locator("[data-testid='zen-essential-section']")).toHaveCount(0);
    },
    clip: "omnibar",
  },
  {
    scene: "display-truncation",
    file: "display-truncation.png",
    ready: (page) => waitForSearch(page, true),
    clip: "omnibar",
  },
  {
    scene: "spacing-size-and-zoom",
    file: "spacing-size-and-zoom.png",
    ready: (page) => waitForSearch(page, true),
    clip: "omnibar",
  },
  {
    scene: "display-colors",
    file: "display-colors.png",
    ready: (page) => waitForSearch(page, true),
    clip: "omnibar",
  },
  {
    scene: "folder-groups",
    file: "folder-groups.png",
    ready: async (page) => {
      await waitForSearch(page, true);
      await expect(page.locator("[data-testid='zen-folder-section']").first()).toBeVisible();
    },
    clip: "omnibar",
  },
  {
    scene: "timers-from-search",
    file: "timers-from-search.png",
    ready: async (page) => {
      await page.locator("[data-testid='zen-search-input']").waitFor();
      await page.locator("[data-omnibar-stage='open']").waitFor();
      await expect(page.getByText("Active timers")).toBeVisible();
    },
    after: (page) => highlight(page.locator("button[aria-label='Close active timers']")),
    clip: "omnibar",
  },
  {
    scene: "timer-form",
    file: "timer-form.png",
    ready: async (page) => {
      await page.locator("[data-testid='zen-search-input']").waitFor();
      await page.locator("[data-omnibar-stage='open']").waitFor();
      await expect(page.getByRole("textbox", { name: "Days" })).toBeVisible();
    },
    clip: "omnibar",
  },
  {
    scene: "host-overrides",
    file: "host-overrides.png",
    ready: async (page) => {
      await page.locator("[data-testid='zen-search-input']").waitFor();
      await page.locator("[data-omnibar-stage='open']").waitFor();
      await expect(page.getByRole("heading", { name: "Host overrides" })).toBeVisible();
    },
    clip: "omnibar",
  },
  {
    scene: "search-omnibar",
    file: "tab-context-menu.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      await (await tabRow(page)).click({ button: "right" });
      await expect(page.locator("[data-testid='zen-tab-context-menu']")).toBeVisible();
    },
  },
  {
    scene: "search-omnibar",
    file: "rename-tab.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      await (await tabRow(page)).click({ button: "right" });
      await page.getByRole("menuitem", { name: "Rename" }).click();
      await expect(page.getByText("Rename tab")).toBeVisible();
    },
  },
  {
    scene: "search-omnibar",
    file: "tab-status.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      await page
        .locator("[data-testid='zen-status-button']")
        .first()
        .evaluate((button) => {
          if (button instanceof HTMLButtonElement) {
            button.click();
          }
        });
      await expect(page.locator("[data-testid='zen-traffic-light-menu']")).toBeVisible();
    },
  },
  {
    scene: "search-omnibar",
    file: "rename-essential.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      await page
        .locator("[data-testid='zen-essential-grid'] [data-testid='zen-search-item']")
        .first()
        .click({ button: "right" });
      await page.getByRole("menuitem", { name: "Rename" }).click();
      await expect(page.getByText("Rename tab")).toBeVisible();
    },
  },
  {
    scene: "search-omnibar",
    file: "tab-move-to-folder.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      await (await tabRow(page)).click({ button: "right" });
      await page.getByRole("menuitem", { name: "Move to folder" }).click();
      await expect(page.locator("[data-testid='zen-tab-folder-menu']")).toBeVisible();
    },
    clip: "omnibar",
  },
  {
    scene: "search-omnibar",
    file: "pinned-url.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      await page
        .locator("[data-testid='zen-essential-grid'] [data-testid='zen-search-item']")
        .first()
        .click({ button: "right" });
      await page.getByRole("menuitem", { name: "Edit pinned URL" }).click();
      await expect(page.getByText("Edit pinned URL").first()).toBeVisible();
    },
    clip: "omnibar",
  },
  {
    scene: "collapsed-folders",
    file: "collapse-all.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      await page.locator("[data-testid='zen-collapse-tabs']").click();
      await page.locator("[data-testid='zen-collapse-issues']").click();
      await expect(page.locator("[data-testid='zen-collapse-tabs']")).toHaveText("Expand all");
      await expect(page.locator("[data-testid='zen-collapse-issues']")).toHaveText("Expand all");
    },
    clip: "omnibar",
  },
  {
    scene: "search-omnibar",
    file: "web-search.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      await page.locator("[data-testid='zen-search-input']").fill("firefox keyboard shortcuts");
      await page.locator("[data-testid='zen-search-engine']").click();
      await expect(page.locator("[data-testid='zen-search-engine-menu']")).toBeVisible();
    },
    around:
      "[data-testid='zen-search-engine-picker'], [data-testid='zen-search-engine-menu'], [data-testid='zen-search-input']",
  },
  {
    scene: "search-omnibar",
    file: "tooltip.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      const row = await tabRow(page);
      await row.hover();
      const copy = row.getByRole("button", { name: "Copy link" });
      await copy.hover();
      await expect(page.locator("[role='tooltip']")).toBeVisible();
      // Let the legend finish printing its letters.
      await page.waitForTimeout(1200);
    },
    around:
      "[role='tooltip'], [data-testid='zen-search-item']:has(button[aria-label='Copy link']:hover)",
  },
  {
    scene: "gap-ratio-gap",
    file: "gap-ratio-gap.png",
    ready: (page) => waitForSearch(page, true),
    around: "[data-testid='zen-essential-section'], [data-testid='zen-tab-list']",
  },
  {
    scene: "gap-ratio-padding",
    file: "gap-ratio-padding.png",
    ready: (page) => waitForSearch(page, true),
    around: "[data-testid='zen-essential-section'], [data-testid='zen-tab-list']",
  },
  {
    scene: "display-settings",
    file: "gap-settings.png",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    },
    locator: "section:has([data-testid='zen-gapPaddingRatio'])",
  },
  {
    scene: "display-settings",
    file: "background-opacity-settings.png",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    },
    locator: "section:has([data-testid='zen-background-opacity'])",
  },
  {
    scene: "display-settings",
    file: "theme-colors.png",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
      await expect(page.getByTestId("zen-theme-colors")).toBeVisible();
    },
    around: "[data-testid='zen-theme-colors']",
  },
  {
    scene: "custom-colors-settings",
    file: "custom-colors-settings.png",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
      await expect(page.getByTestId("zen-theme-colors")).toBeVisible();
      await expect(page.getByTestId("zen-theme-colors")).toContainText("#E0943A");
    },
    around: "[data-testid='zen-theme-colors']",
  },
  {
    scene: "display-settings",
    file: "sound-settings.png",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    },
    locator: "section:has([data-testid='zen-sound-enabled'])",
  },
  {
    scene: "search-omnibar",
    file: "status-bar.png",
    ready: (page) => waitForSearch(page, true),
    around: "[data-testid='zen-status-bar']",
  },
  {
    scene: "update-available",
    file: "status-bar-update.png",
    ready: (page) => waitForSearch(page, true),
    after: async (page) => {
      await page.getByTestId("zen-update-notice").getByRole("button").click();
      await expect(page.getByTestId("zen-update-panel")).toBeVisible();
    },
    around: "[data-testid='zen-status-bar'], [data-testid='zen-update-panel']",
  },
  {
    scene: "search-omnibar",
    file: "settings-gear.png",
    ready: (page) => waitForSearch(page, true),
    after: (page) => highlight(page.getByRole("button", { name: "Open display settings" })),
    clip: "omnibar",
  },
  {
    scene: "search-omnibar",
    file: "timers-button.png",
    ready: (page) => waitForSearch(page, true),
    after: (page) => highlight(page.locator("button[aria-label='Show active timers']")),
    around:
      "button[aria-label='Show active timers'], button[aria-label='Host overrides for this tab'], button[aria-label='Open display settings']",
  },
  {
    scene: "display-settings",
    file: "display-settings.png",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    },
    fullPage: true,
  },
  {
    scene: "display-settings",
    file: "mcp-settings.png",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    },
    locator: "section:has([data-testid='zen-bridgeEnabled'])",
  },
  {
    scene: "display-settings",
    file: "external-links-settings.png",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    },
    after: async (page) => {
      await page.locator("[data-testid='zen-reuseExternalTabs']").check();
    },
    locator: "section:has([data-testid='zen-reuseExternalTabs'])",
  },
  {
    scene: "timer-popup",
    file: "timer-natural-language.png",
    ready: async (page) => {
      await expect(page.getByRole("textbox", { name: "Days" })).toBeVisible();
    },
    after: async (page) => {
      await page.getByPlaceholder("tomorrow at 9am or 1d 30m").fill("friday at 5pm");
      await expect(page.getByText("Use a time like")).toHaveCount(0);
    },
    clip: "card",
  },
  {
    scene: "timer-popup",
    file: "timer-popup.png",
    ready: async (page) => {
      await expect(page.getByRole("textbox", { name: "Days" })).toBeVisible();
    },
    clip: "card",
  },
  {
    scene: "host-popup",
    file: "host-popup.png",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Host overrides" })).toBeVisible();
    },
    clip: "card",
  },
];

for (const theme of THEMES) {
  test.describe(`README screenshots (${theme.name})`, () => {
    test.use({ colorScheme: theme.colorScheme });

    test.beforeAll(async () => {
      await mkdir(theme.outputDir, { recursive: true });
    });

    for (const capture of captures) {
      test(capture.file, async ({ page }) => {
        await page.goto(`/screenshots/index.html?scene=${capture.scene}`);
        await (capture.ready?.(page) ?? Promise.resolve());
        await capture.after?.(page);
        const target = path.join(theme.outputDir, capture.file);
        const options = { path: target, animations: "disabled" as const };
        if (capture.around) {
          const boxes = await page
            .locator(capture.around)
            .evaluateAll((elements) =>
              elements.map((element) => element.getBoundingClientRect().toJSON() as DOMRect),
            );
          const margin = 12;
          const left = Math.min(...boxes.map((box) => box.left)) - margin;
          const top = Math.min(...boxes.map((box) => box.top)) - margin;
          const right = Math.max(...boxes.map((box) => box.right)) + margin;
          const bottom = Math.max(...boxes.map((box) => box.bottom)) + margin;
          await page.screenshot({
            ...options,
            clip: { x: left, y: top, width: right - left, height: bottom - top },
          });
          return;
        }
        if (capture.locator) {
          await page.locator(capture.locator).screenshot(options);
          return;
        }
        if (capture.clip === "popup") {
          await page.locator("[data-harness-popup]").screenshot(options);
          return;
        }
        if (capture.clip === "card") {
          await page.locator("[data-harness-card]").screenshot(options);
          return;
        }
        if (capture.clip === "omnibar") {
          await page.locator("[data-omnibar]").screenshot(options);
          return;
        }
        await page.screenshot({ ...options, fullPage: capture.fullPage === true });
      });
    }
  });
}
