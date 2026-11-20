import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const outDir = path.join(fileURLToPath(new URL("..", import.meta.url)), "test-results");

test("omnibar paint by feature", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/screenshots/index.html?scene=paint-bench");
  const report = await page.evaluate(async () => {
    const bench = window.__zenPaintBench;
    if (!bench) {
      throw new Error("Paint bench did not install.");
    }
    return bench.run({ repeats: 7 });
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "paint-bench.json"), JSON.stringify(report, null, 2));
  console.log(`\n${report.text}\n`);

  const byId = new Map(report.cases.map((item) => [item.id, item]));
  expect(byId.get("simple")?.rows).toBeGreaterThan(0);
  expect(byId.get("simple")?.todoRows).toBe(0);
  expect(byId.get("simple")?.issueRows).toBe(0);
  expect(byId.get("simple")?.statusBar).toBe(false);
  expect(byId.get("todos")?.todoRows).toBeGreaterThan(0);
  expect(byId.get("forgeTree")?.issueRows).toBeGreaterThan(0);
  expect(byId.get("statusBar")?.statusBar).toBe(true);
  expect(byId.get("statusColors")?.statusButtons).toBeGreaterThan(0);
});
