import { spawnSync } from "node:child_process";

const allowedErrorCodes = new Set(["MANIFEST_FIELD_PRIVILEGED"]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (!options.capture && result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

run("npm", ["run", "build"]);

const lint = run(
  "npx",
  ["web-ext", "lint", "--source-dir=.output/firefox-mv2", "--output", "json", "--self-hosted"],
  { capture: true },
);

const jsonLine = lint.stdout
  .split("\n")
  .map((line) => line.trim())
  .find((line) => line.startsWith("{"));

if (!jsonLine) {
  process.stderr.write(lint.stderr || lint.stdout || "web-ext lint did not return JSON output.\n");
  process.exit(lint.status ?? 1);
}

const report = JSON.parse(jsonLine);
const blockingErrors = report.errors.filter((error) => !allowedErrorCodes.has(error.code));

for (const warning of report.warnings) {
  console.warn(`web-ext warning ${warning.code}: ${warning.message}`);
}

for (const error of report.errors) {
  const prefix = allowedErrorCodes.has(error.code) ? "allowed" : "error";
  console.warn(`web-ext ${prefix} ${error.code}: ${error.message}`);
}

if (blockingErrors.length > 0) {
  process.exit(1);
}

console.log("web-ext lint passed with only known sideload-only extension findings.");
