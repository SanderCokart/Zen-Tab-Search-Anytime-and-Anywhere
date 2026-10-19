import { readFileSync } from "node:fs";
import { loadEnv } from "vite";

/** Experiment scripts whose `const DEBUG = …;` line follows WXT_DEBUG. */
const EXPERIMENT_APIS = ["experiment/zenTabs/api.js", "experiment/zenHosts/api.js"];
const DEBUG_PATTERN = /const DEBUG = (?:true|false);/;

export function isWxtDebugEnabled(mode, root) {
  const env = loadEnv(mode, root, "");
  const raw = process.env.WXT_DEBUG ?? env.WXT_DEBUG ?? "";
  return raw === "true" || raw === "1";
}

export function applyExperimentDebugFlag(source, enabled, name = EXPERIMENT_APIS[0]) {
  if (!DEBUG_PATTERN.test(source)) {
    throw new Error(`Could not find DEBUG flag in ${name}`);
  }
  return source.replace(DEBUG_PATTERN, `const DEBUG = ${enabled};`);
}

export function injectExperimentDebugAsset(wxt, files) {
  const enabled = isWxtDebugEnabled(wxt.config.mode, wxt.config.root);
  for (const name of EXPERIMENT_APIS) {
    const index = files.findIndex((file) => file.relativeDest.replaceAll("\\", "/") === name);
    if (index < 0) {
      throw new Error(`Missing public asset ${name}`);
    }

    const file = files[index];
    const source = "absoluteSrc" in file ? readFileSync(file.absoluteSrc, "utf8") : file.contents;
    files[index] = {
      relativeDest: name,
      contents: applyExperimentDebugFlag(source, enabled, name),
    };
  }
}
