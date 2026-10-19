import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const EXPERIMENTS = ["zenTabs", "zenHosts"] as const;

function experimentSource(name: (typeof EXPERIMENTS)[number]): string {
  // Vitest runs from the repo root.
  return readFileSync(path.resolve("public/experiment", name, "api.js"), "utf8");
}

describe("experiment scripts", () => {
  it("load side by side in one shared global, as Firefox runs them", () => {
    // Firefox evaluates every experiment script of an add-on in the same global,
    // so a top-level declaration in one (say `const DEBUG`) breaks the other.
    const global = vm.createContext({ ExtensionAPI: class {} });
    for (const name of EXPERIMENTS) {
      expect(() =>
        vm.runInContext(experimentSource(name), global, { filename: name }),
      ).not.toThrow();
    }
    for (const name of EXPERIMENTS) {
      expect(typeof (global as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
