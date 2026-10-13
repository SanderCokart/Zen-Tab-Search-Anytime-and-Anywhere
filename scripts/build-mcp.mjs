import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

export const MCP_OUTFILE = path.join(rootDir, "mcp", "dist", "zen-tab-search-mcp.mjs");

// Bundles the MCP server and its dependencies into one file so an MCP client
// only needs `node mcp/dist/zen-tab-search-mcp.mjs`, with no install step.
export async function buildMcp() {
  await build({
    absWorkingDir: rootDir,
    entryPoints: ["mcp/server.ts"],
    outfile: MCP_OUTFILE,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    // Resolves the `@/` alias the same way the extension build does.
    tsconfig: "tsconfig.json",
    // Ties the server to the extension release it was built with.
    define: { __ZEN_MCP_VERSION__: JSON.stringify(version) },
    // `ws` is CommonJS and requires Node built-ins, which an ESM bundle cannot
    // do without a real `require`.
    banner: {
      js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    },
    logLevel: "info",
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildMcp();
}
