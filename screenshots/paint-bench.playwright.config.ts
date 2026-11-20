import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  testDir: ".",
  testMatch: "paint-bench.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4177",
    viewport: { width: 1600, height: 1000 },
  },
  webServer: {
    command:
      "npx vite --config screenshots/vite.config.ts --host 127.0.0.1 --port 4177 --strictPort",
    cwd: repoRoot,
    url: "http://127.0.0.1:4177/screenshots/index.html",
    reuseExistingServer: false,
  },
  outputDir: "../test-results/paint-bench",
});
