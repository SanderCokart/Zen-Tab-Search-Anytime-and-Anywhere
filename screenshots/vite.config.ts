import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const repoRoot = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");

export default defineConfig({
  // Repo root so Tailwind v4 scans `features/` and `shared/` for class names.
  root: repoRoot,
  publicDir: false,
  plugins: [preact({ reactAliasesEnabled: false }), tailwindcss()],
  resolve: {
    alias: { "@": repoRoot },
  },
  server: {
    host: "127.0.0.1",
    port: 4177,
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
});
