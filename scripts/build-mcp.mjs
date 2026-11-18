import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

export const MCP_OUTFILE = path.join(rootDir, "mcp", "dist", "zen-deck-mcp.mjs");

const stub = (name) => path.join(rootDir, "scripts", "mcp-stubs", name);
const zodV4 = path.join(rootDir, "node_modules", "zod", "v4", "classic", "external.js");

// Exact import rewrites. esbuild's `alias` is prefix-based, so `zod` → `zod/v4`
// would also rewrite `zod/v4` to `zod/v4/v4`.
function zodV4OnlyPlugin() {
  const rewrites = new Map([
    ["zod", zodV4],
    ["zod/v3", stub("zod-v3.mjs")],
    ["zod-to-json-schema", stub("zod-to-json-schema.mjs")],
    ["zod/v4/locales", stub("zod-locales.mjs")],
    ["zod/v4/locales/index.js", stub("zod-locales.mjs")],
  ]);
  return {
    name: "zod-v4-only",
    setup(build) {
      build.onResolve(
        { filter: /^(zod|zod\/v3|zod-to-json-schema|zod\/v4\/locales(?:\/index\.js)?)$/ },
        (args) => {
          const target = rewrites.get(args.path);
          return target ? { path: target } : undefined;
        },
      );
    },
  };
}

// Bundles the MCP server and its dependencies into one file so an MCP client
// only needs `node mcp/dist/zen-deck-mcp.mjs`, with no install step.
export async function buildMcp() {
  await build({
    absWorkingDir: rootDir,
    entryPoints: ["mcp/server.ts"],
    outfile: MCP_OUTFILE,
    bundle: true,
    minify: true,
    platform: "node",
    format: "esm",
    target: "node20",
    // Resolves the `@/` alias the same way the extension build does.
    tsconfig: "tsconfig.json",
    // Ties the server to the extension release it was built with.
    define: { __ZEN_MCP_VERSION__: JSON.stringify(version) },
    plugins: [zodV4OnlyPlugin()],
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
