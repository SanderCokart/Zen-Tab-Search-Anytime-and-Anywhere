import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiPath = resolve(__dirname, "../public/experiment/zenTabs/api.js");
const enabled = process.argv[2] === "true";
const pattern = /const DEBUG = (?:true|false);/;

const source = readFileSync(apiPath, "utf8");
if (!pattern.test(source)) {
  throw new Error("Could not find DEBUG flag in public/experiment/zenTabs/api.js");
}

const next = source.replace(pattern, `const DEBUG = ${enabled};`);
if (next !== source) {
  writeFileSync(apiPath, next);
}
