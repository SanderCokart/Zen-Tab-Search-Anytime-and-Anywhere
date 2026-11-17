import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printUsage() {
  console.error(
    [
      "Usage:",
      "  npm run zip",
      "  npm run zip -- <name>",
      "  npm run zip -- --name <name>",
      "  npm run zip -- --tag <tag>",
      "  npm run zip:no-sources",
      "  npm run zip -- --no-sources <name>",
      "",
      "By default the Firefox zip is named zen-tab-search-demo-firefox.zip,",
      "and a sources zip is written beside it.",
      "Provide a name to replace the demo label, or --tag to use a release tag.",
      "--no-sources skips the sources zip. npm run zip:no-sources does the same.",
    ].join("\n"),
  );
}

function sanitizeLabel(value, optionName) {
  const label = String(value ?? "")
    .trim()
    .replace(/[/\\]+/g, "-");
  if (!label) {
    fail(`${optionName} must be a non-empty label.`);
  }
  if (label.includes("..") || /[<>:"|?*]/.test(label) || label.includes("\0")) {
    fail(`${optionName} contains invalid characters: ${label}`);
  }
  return label;
}

function parseArgs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return { help: true };
  }

  const parsed = {
    name: undefined,
    tag: undefined,
    noSources: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--name") {
      parsed.name = args[index + 1];
      if (!parsed.name || parsed.name.startsWith("-")) {
        fail("--name requires a value.");
      }
      index += 1;
    } else if (arg.startsWith("--name=")) {
      parsed.name = arg.slice("--name=".length);
    } else if (arg === "--tag") {
      parsed.tag = args[index + 1];
      if (!parsed.tag || parsed.tag.startsWith("-")) {
        fail("--tag requires a value.");
      }
      index += 1;
    } else if (arg.startsWith("--tag=")) {
      parsed.tag = arg.slice("--tag=".length);
    } else if (arg === "--no-sources") {
      parsed.noSources = true;
    } else if (arg.startsWith("-")) {
      fail(`Unknown option: ${arg}`);
    } else if (!parsed.name) {
      parsed.name = arg;
    } else {
      fail(`Unexpected argument: ${arg}`);
    }
  }

  if (parsed.name && parsed.tag) {
    fail("Use either a name or --tag, not both.");
  }

  return parsed;
}

function resolveLabel(parsed) {
  if (parsed.tag) {
    return sanitizeLabel(parsed.tag, "--tag");
  }
  if (parsed.name) {
    return sanitizeLabel(parsed.name, "name");
  }
  return "demo";
}

function run(label, command, args, env = {}) {
  console.log("");
  console.log(`==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    return;
  }

  const zipLabel = resolveLabel(parsed);
  console.log(`Zip label: ${zipLabel}`);

  run("Creating extension zip", "npx", ["wxt", "zip", "-b", "firefox"], {
    ZIP_ARTIFACT_LABEL: zipLabel,
    ...(parsed.noSources ? { ZIP_SOURCES: "false" } : {}),
  });

  console.log("");
  console.log(`Created .output/zen-tab-search-${zipLabel}-firefox.zip`);
  if (parsed.noSources) {
    console.log("Skipped the sources zip.");
  }
}

main();
