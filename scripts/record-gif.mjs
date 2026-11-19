// Records short GIFs of the mocked UI harness for release notes.
//
//   node scripts/record-gif.mjs                 # every flow
//   node scripts/record-gif.mjs organize-tabs   # one flow
//
// Each flow drives the harness with Playwright, the video is converted with
// ffmpeg (palettegen) into docs/gifs/<name>.gif. Add a flow to FLOWS below.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(root, "docs", "gifs");
const PORT = 4179;
const base = `http://127.0.0.1:${PORT}/screenshots/index.html`;
const SIZE = { width: 1500, height: 900 };

const pause = (page, ms) => page.waitForTimeout(ms);

async function openScene(page, scene) {
  await page.goto(`${base}?scene=${scene}&busy=1`);
  await page.locator("[data-testid='zen-search-input']").waitFor();
  await page.locator("[data-omnibar-stage='open']").waitFor();
  await page.locator("[data-testid='zen-search-item']").first().waitFor();
  // The video starts blank; toGif trims everything before this moment.
  page.readyAt = Date.now();
}

/** @type {Record<string, (page: import("@playwright/test").Page) => Promise<void>>} */
const FLOWS = {
  "organize-tabs": async (page) => {
    await openScene(page, "concept-dev");
    await pause(page, 900);
    await page.locator("[data-testid='zen-organize-forge']").click();
    await pause(page, 500);
    await page.locator("[data-testid='zen-organize-forge-tree']").hover();
    await pause(page, 1600);
    await page.locator("[data-testid='zen-organize-forge-by-issue']").hover();
    await pause(page, 1800);
    await page.locator("[data-testid='zen-organize-forge-by-issue']").click();
    await pause(page, 1600);
  },
  "todo-reorder": async (page) => {
    await openScene(page, "concept-dev");
    const rows = page.locator("[data-testid='zen-todo-row']");
    await rows.first().waitFor();
    await pause(page, 900);
    const from = await rows.nth((await rows.count()) - 1).boundingBox();
    const to = await rows.first().boundingBox();
    if (!from || !to) throw new Error("todo rows not laid out");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    const steps = 40;
    for (let i = 1; i <= steps; i += 1) {
      await page.mouse.move(
        from.x + from.width / 2,
        from.y + from.height / 2 + ((to.y - from.y - 4) * i) / steps,
      );
      await pause(page, 40);
    }
    await pause(page, 300);
    await page.mouse.up();
    await pause(page, 1600);
  },
  "issue-sort": async (page) => {
    await openScene(page, "concept-dev");
    await pause(page, 900);
    const select = page.locator("[data-testid='zen-forge-sort']");
    for (const value of ["desc", "asc", "old", "recent"]) {
      await select.selectOption(value);
      await pause(page, 1100);
    }
  },
};

function toGif(video, gif, trimSeconds) {
  const filter =
    "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4";
  const result = spawnSync(
    "ffmpeg",
    ["-y", "-ss", trimSeconds.toFixed(2), "-i", video, "-vf", filter, "-loop", "0", gif],
    {
      stdio: "inherit",
    },
  );
  if (result.status !== 0) throw new Error("ffmpeg failed");
}

const wanted = process.argv.slice(2);
const names = wanted.length > 0 ? wanted : Object.keys(FLOWS);
for (const name of names) {
  if (!FLOWS[name])
    throw new Error(`Unknown flow "${name}". Known: ${Object.keys(FLOWS).join(", ")}`);
}

mkdirSync(outDir, { recursive: true });
const server = spawn(
  "npx",
  [
    "vite",
    "--config",
    "screenshots/vite.config.ts",
    "--host",
    "127.0.0.1",
    "--port",
    String(PORT),
    "--strictPort",
  ],
  { cwd: root, shell: true, stdio: "ignore" },
);
try {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* server not up yet */
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
  }
  const browser = await chromium.launch();
  for (const name of names) {
    const dir = mkdtempSync(path.join(tmpdir(), "zen-gif-"));
    const context = await browser.newContext({
      colorScheme: "dark",
      viewport: SIZE,
      recordVideo: { dir, size: SIZE },
    });
    const startedAt = Date.now();
    const page = await context.newPage();
    await FLOWS[name](page);
    await context.close(); // flushes the video
    const video = readdirSync(dir).find((file) => file.endsWith(".webm"));
    const gif = path.join(outDir, `${name}.gif`);
    toGif(path.join(dir, video), gif, Math.max(0, (page.readyAt - startedAt) / 1000));
    rmSync(dir, { recursive: true, force: true });
    console.log(`${name}.gif ${(statSync(gif).size / 1024 / 1024).toFixed(2)} MB`);
  }
  await browser.close();
} finally {
  spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
}
