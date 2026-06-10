// TODO(zen-tab-search): Confirm AMO signing setup for this extension. The upstream
// add-on may already exist under a different developer account or as a listed release.
// Verify gecko ID, channel (listed vs unlisted), and whether web-ext sign should target
// a new AMO listing or an existing one before using this in production releases.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const issuer = process.env.AMO_JWT_ISSUER;
const secret = process.env.AMO_JWT_SECRET;

if (!issuer || !secret) {
  console.error("Error: AMO API credentials are required.");
  console.error("");
  console.error("1. Create a Mozilla developer account: https://addons.mozilla.org/developers/");
  console.error(
    "2. Generate API credentials: https://addons.mozilla.org/developers/addon/api/key/",
  );
  console.error("3. Set up encrypted credentials, then decrypt locally:");
  console.error("");
  console.error("   npm run env:use:local");
  console.error("   npm run sign");
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("Building extension...");
run("npm", ["run", "build"]);

console.log("");
console.log("Linting extension...");
run("npx", ["web-ext", "lint", "--source-dir=.output/firefox-mv2"]);

console.log("");
console.log("Signing extension (unlisted channel)...");
run("npx", [
  "web-ext",
  "sign",
  "--source-dir=.output/firefox-mv2",
  "--channel=unlisted",
  "--artifacts-dir=./signed",
  "--approval-timeout=0",
  `--api-key=${issuer}`,
  `--api-secret=${secret}`,
]);

console.log("");
console.log("Submission sent to Mozilla. Automatic signing can take minutes to hours.");
console.log("When approved, download the signed .xpi with:");
console.log("  npm run download-signed");
console.log("");
console.log("Then install in Firefox via about:addons -> gear icon -> Install Add-on From File...");
