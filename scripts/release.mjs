import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const packagePath = path.join(rootDir, "package.json");
const packageLockPath = path.join(rootDir, "package-lock.json");

function run(label, command, args, options = {}) {
  console.log("");
  console.log(`==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    shell: options.shell ?? process.platform === "win32",
  });
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stderr || result.stdout || "");
    }
    process.exit(result.status ?? 1);
  }
  return options.capture ? result.stdout.trim() : "";
}

function fail(message) {
  console.error(`Error: ${message}`);
  console.error("");
  printUsage();
  process.exit(1);
}

function printUsage() {
  const output = [
    "Usage:",
    '  npm run release -- patch --message "Release notes"',
    "  npm run release -- minor --notes-file ./RELEASE.md",
    "",
    "Bump:",
    "  patch | bump | minor | major | x.y.z",
    "",
    "Release notes:",
    "  -m, --message <text>",
    "  --notes-file <path>",
  ].join("\n");

  console.error(output);
}

function parseArgs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const parsed = {
    bumpArg: undefined,
    message: undefined,
    notesFile: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--message" || arg === "-m") {
      parsed.message = args[index + 1];
      if (!parsed.message || parsed.message.startsWith("-")) {
        fail(`${arg} requires a release notes string.`);
      }
      index += 1;
    } else if (arg === "--notes-file") {
      parsed.notesFile = args[index + 1];
      if (!parsed.notesFile || parsed.notesFile.startsWith("-")) {
        fail("--notes-file requires a path.");
      }
      index += 1;
    } else if (arg.startsWith("--message=")) {
      parsed.message = arg.slice("--message=".length);
    } else if (arg.startsWith("--notes-file=")) {
      parsed.notesFile = arg.slice("--notes-file=".length);
    } else if (arg.startsWith("-")) {
      fail(`Unknown option: ${arg}`);
    } else if (!parsed.bumpArg) {
      parsed.bumpArg = arg;
    } else {
      fail(`Unexpected argument: ${arg}`);
    }
  }

  if (!parsed.message && !parsed.notesFile) {
    fail("Release notes are required. Use --message or --notes-file.");
  }

  if (parsed.message && parsed.notesFile) {
    fail("Use either --message or --notes-file, not both.");
  }

  return parsed;
}

function parseBumpArg(arg = "patch") {
  if (arg === "patch" || arg === "bump") {
    return { kind: "patch" };
  }
  if (arg === "minor" || arg === "major") {
    return { kind: arg };
  }
  if (/^\d+\.\d+\.\d+$/.test(arg)) {
    return { kind: "exact", version: arg };
  }
  fail(`Invalid release bump: "${arg}"`);
}

function bumpVersion(current, bump) {
  if (bump.kind === "exact") {
    return bump.version;
  }

  const match = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    fail(`Cannot bump non-semver version: ${current}`);
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

function assertCleanWorkingTree() {
  const status = run("Checking git working tree", "git", ["status", "--porcelain"], {
    capture: true,
    shell: false,
  });
  if (status) {
    console.error(status);
    fail("Working tree must be clean before creating a release.");
  }
}

function assertTagDoesNotExist(tagName) {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tagName}`], {
    cwd: rootDir,
    stdio: "ignore",
    shell: false,
  });
  if (result.status === 0) {
    fail(`Tag ${tagName} already exists.`);
  }
}

function assertGitHubCli() {
  run("Checking GitHub CLI", "gh", ["--version"], { capture: true });
  run("Checking GitHub authentication", "gh", ["auth", "status"], { capture: true });
}

function resolveNotesFile(notesFile) {
  if (!notesFile) {
    return undefined;
  }

  const resolved = path.resolve(rootDir, notesFile);
  if (!fs.existsSync(resolved)) {
    fail(`Release notes file does not exist: ${notesFile}`);
  }
  return resolved;
}

function findZipArtifact(version) {
  const outputDir = path.join(rootDir, ".output");
  if (!fs.existsSync(outputDir)) {
    return undefined;
  }

  const zipFiles = [];
  const pendingDirs = [outputDir];

  while (pendingDirs.length > 0) {
    const currentDir = pendingDirs.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pendingDirs.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".zip")) {
        zipFiles.push(entryPath);
      }
    }
  }

  const versionedZip = zipFiles.find((file) => path.basename(file).includes(version));
  if (versionedZip) {
    return versionedZip;
  }

  return zipFiles
    .map((file) => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.file;
}

const args = parseArgs(process.argv.slice(2));
const bump = parseBumpArg(args.bumpArg);
const notesFile = resolveNotesFile(args.notesFile);
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const oldVersion = pkg.version;
const newVersion = bumpVersion(oldVersion, bump);
const tagName = `v${newVersion}`;

console.log(`Release: v${oldVersion} -> ${tagName}`);

assertCleanWorkingTree();
assertTagDoesNotExist(tagName);
assertGitHubCli();

run("Bumping package version", "npm", ["version", newVersion, "--no-git-tag-version"]);
run("Building extension", "npm", ["run", "build"]);
run("Creating extension zip", "npm", ["run", "zip"]);

const zipArtifact = findZipArtifact(newVersion);
if (!zipArtifact) {
  fail("No zip artifact was found in .output after npm run zip.");
}

run("Staging version files", "git", ["add", packagePath, packageLockPath], { shell: false });
run("Committing version bump", "git", ["commit", "-m", `Release ${tagName}`], { shell: false });
run("Tagging release commit", "git", ["tag", "-a", tagName, "-m", `Release ${tagName}`], {
  shell: false,
});

const releaseArgs = ["release", "create", tagName, zipArtifact, "--title", tagName];
if (notesFile) {
  releaseArgs.push("--notes-file", notesFile);
} else {
  releaseArgs.push("--notes", args.message);
}
run("Creating GitHub release", "gh", releaseArgs);

console.log("");
console.log(`Release ${tagName} created with ${path.relative(rootDir, zipArtifact)} attached.`);
