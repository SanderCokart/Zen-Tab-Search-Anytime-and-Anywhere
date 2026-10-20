import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

const outputDir = path.join(fileURLToPath(new URL("..", import.meta.url)), "docs", "screenshots");

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
    scene: "search-popup",
    file: "search-popup.png",
    ready: (page) => waitForSearch(page, false),
    clip: "popup",
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
    after: (page) => highlight(page.locator("button[title='Close active timers']")),
    clip: "omnibar",
  },
  {
    scene: "timer-form",
    file: "timer-form.png",
    ready: async (page) => {
      await page.locator("[data-testid='zen-search-input']").waitFor();
      await page.locator("[data-omnibar-stage='open']").waitFor();
      await expect(page.getByText("Presets")).toBeVisible();
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
    file: "settings-gear.png",
    ready: (page) => waitForSearch(page, true),
    after: (page) => highlight(page.getByRole("button", { name: "Open display settings" })),
    clip: "omnibar",
  },
  {
    scene: "search-omnibar",
    file: "timers-button.png",
    ready: (page) => waitForSearch(page, true),
    after: (page) => highlight(page.locator("button[title='Show active timers']")),
    around:
      "button[title='Show active timers'], button[title='Host overrides for this tab'], button[title='Open display settings']",
  },
  {
    scene: "display-settings",
    file: "display-settings.png",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Display options" })).toBeVisible();
    },
    fullPage: true,
  },
  {
    scene: "display-settings",
    file: "mcp-settings.png",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Display options" })).toBeVisible();
    },
    locator: "fieldset:has([data-testid='zen-bridgeEnabled'])",
  },
  {
    scene: "display-settings",
    file: "external-links-settings.png",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Display options" })).toBeVisible();
    },
    after: async (page) => {
      await page.locator("[data-testid='zen-reuseExternalTabs']").check();
    },
    locator: "fieldset:has([data-testid='zen-reuseExternalTabs'])",
  },
  {
    scene: "timer-popup",
    file: "timer-natural-language.png",
    ready: async (page) => {
      await expect(page.getByText("Presets")).toBeVisible();
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
      await expect(page.getByText("Presets")).toBeVisible();
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

test.describe("README screenshots", () => {
  test.beforeAll(async () => {
    await mkdir(outputDir, { recursive: true });
  });

  for (const capture of captures) {
    test(capture.file, async ({ page }) => {
      await page.goto(`/screenshots/index.html?scene=${capture.scene}`);
      await (capture.ready?.(page) ?? Promise.resolve());
      await capture.after?.(page);
      const target = path.join(outputDir, capture.file);
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
