import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  envPrefix: ["VITE_", "WXT_"],
  plugins: [preact({ reactAliasesEnabled: false }), tailwindcss()],
  resolve: {
    // Mirrors the `@/*` alias WXT generates in .wxt/tsconfig.json so tests and
    // the extension build resolve imports identically.
    alias: { "@": root.replace(/\/$/, "") },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    passWithNoTests: true,
  },
});
