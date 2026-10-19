import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const outputDir = path.join(fileURLToPath(new URL("..", import.meta.url)), "docs", "screenshots");

type Capture = {
  scene: string;
  file: string;
  ready?: (page: Page) => Promise<void>;
  after?: (page: Page) => Promise<void>;
  fullPage?: boolean;
  clip?: "omnibar" | "popup" | "card";
  locator?: string;
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
