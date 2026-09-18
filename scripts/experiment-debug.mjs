import { readFileSync } from "node:fs";
import { loadEnv } from "vite";

const EXPERIMENT_API = "experiment/zenTabs/api.js";
const DEBUG_PATTERN = /const DEBUG = (?:true|false);/;

export function isWxtDebugEnabled(mode, root) {
  const env = loadEnv(mode, root, "");
  const raw = process.env.WXT_DEBUG ?? env.WXT_DEBUG ?? "";
  return raw === "true" || raw === "1";
}

export function applyExperimentDebugFlag(source, enabled) {
  if (!DEBUG_PATTERN.test(source)) {
    throw new Error(`Could not find DEBUG flag in ${EXPERIMENT_API}`);
  }
  return source.replace(DEBUG_PATTERN, `const DEBUG = ${enabled};`);
}

export function injectExperimentDebugAsset(wxt, files) {
  const index = files.findIndex(
    (file) => file.relativeDest.replaceAll("\\", "/") === EXPERIMENT_API,
  );
  if (index < 0) {
    throw new Error(`Missing public asset ${EXPERIMENT_API}`);
  }

  const file = files[index];
  const source = "absoluteSrc" in file ? readFileSync(file.absoluteSrc, "utf8") : file.contents;
  files[index] = {
    relativeDest: EXPERIMENT_API,
    contents: applyExperimentDebugFlag(source, isWxtDebugEnabled(wxt.config.mode, wxt.config.root)),
  };
}
