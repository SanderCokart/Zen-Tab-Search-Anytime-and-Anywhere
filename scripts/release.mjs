// TODO(zen-tab-search): Add Vitest coverage for fuzzyMatchWithScore before relying on
// release.mjs as a full quality gate. Review AMO signing/download flow once listed vs
// unlisted release strategy is decided (see scripts/sign.mjs and download-signed.js).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const packagePath = path.join(rootDir, "package.json");

function run(label, command, args) {
  console.log("");
  console.log(`==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseBumpArg(arg) {
  if (!arg || arg === "patch") {
    return { kind: "patch" };
  }
  if (arg === "minor" || arg === "major") {
    return { kind: arg };
  }
  if (/^\d+\.\d+\.\d+$/.test(arg)) {
    return { kind: "exact", version: arg };
  }
  console.error(`Invalid release bump: "${arg}"`);
  console.error("Usage: npm run release [-- patch|minor|major|x.y.z]");
  process.exit(1);
}

function bumpVersion(current, bump) {
  if (bump.kind === "exact") {
    return bump.version;
  }

  const match = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    console.error(`Cannot bump non-semver version: ${current}`);
    process.exit(1);
  }

  let [major, minor, patch] = match.slice(1).map(Number);
  if (bump.kind === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump.kind === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
}

const bumpArg = process.argv[2];
const bump = parseBumpArg(bumpArg);
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const oldVersion = pkg.version;
const newVersion = bumpVersion(oldVersion, bump);

console.log(`Release: v${oldVersion} -> v${newVersion}`);

run("Regenerating icons", "npm", ["run", "generate-icons"]);
run("ESLint", "npm", ["run", "lint:js"]);
run("Prettier", "npm", ["run", "format"]);
run("Tests", "npm", ["run", "test"]);
run("web-ext lint", "npm", ["run", "lint"]);

pkg.version = newVersion;
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log("");
console.log(`==> Bumped version in package.json: ${oldVersion} -> ${newVersion}`);

run("Sign for Mozilla Add-ons", "npm", ["run", "sign"]);

console.log("");
console.log("Release submission complete.");
console.log(`Version ${newVersion} is pending Mozilla review.`);
console.log("When approved, download the signed .xpi with:");
console.log("  npm run download-signed");
console.log("");
console.log("Then install in Firefox via about:addons -> gear icon -> Install Add-on From File...");
