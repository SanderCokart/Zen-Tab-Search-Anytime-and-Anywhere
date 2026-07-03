import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const packagePath = path.join(rootDir, "package.json");
const packageLockPath = path.join(rootDir, "package-lock.json");

let releaseStep = "preflight";
let currentTagName;
let versionCommitted = false;
let tagCreated = false;

function run(label, command, args, options = {}) {
  console.log("");
  console.log(`==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    shell: options.shell ?? false,
  });
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stderr || result.stdout || "");
    }
    throw new Error(`${label} failed.`);
  }
  return options.capture ? result.stdout.trim() : "";
}

function fail(message) {
  throw new Error(message);
}

function printUsage() {
  const output = [
    "Usage:",
    '  npm run release -- patch --message "Release notes"',
    "  npm run release -- minor --notes-file ./RELEASE.md",
    "  npm run release -- patch --generate-notes",
    "  npm run release -- patch --dry-run",
    "",
    "Bump:",
    "  patch | bump | minor | major | x.y.z",
    "",
    "Release notes:",
    "  -m, --message <text>",
    "  --notes-file <path>",
    "  --generate-notes",
    "  --notes-since <tag>",
    "",
    "Options:",
    "  --dry-run",
  ].join("\n");

  console.error(output);
}

function parseArgs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return { help: true };
  }

  const parsed = {
    bumpArg: undefined,
    message: undefined,
    notesFile: undefined,
    generateNotes: false,
    notesSince: undefined,
    dryRun: false,
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
    } else if (arg === "--generate-notes") {
      parsed.generateNotes = true;
    } else if (arg === "--notes-since") {
      parsed.notesSince = args[index + 1];
      if (!parsed.notesSince || parsed.notesSince.startsWith("-")) {
        fail("--notes-since requires a tag.");
      }
      index += 1;
    } else if (arg.startsWith("--notes-since=")) {
      parsed.notesSince = arg.slice("--notes-since=".length);
    } else if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg.startsWith("-")) {
      fail(`Unknown option: ${arg}`);
    } else if (!parsed.bumpArg) {
      parsed.bumpArg = arg;
    } else {
      fail(`Unexpected argument: ${arg}`);
    }
  }

  const notesSources = [parsed.message, parsed.notesFile, parsed.generateNotes].filter(Boolean);
  if (notesSources.length > 1) {
    fail("Use only one release notes source: --message, --notes-file, or --generate-notes.");
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

function latestReachableTag() {
  try {
    return run("Finding latest release tag", "git", ["describe", "--tags", "--abbrev=0"], {
      capture: true,
      shell: false,
    });
  } catch {
    return undefined;
  }
}

function generatedNotes(sinceTag, tagName) {
  const range = sinceTag ? `${sinceTag}..HEAD` : "HEAD";
  const output = run("Generating release notes", "git", ["log", range, "--pretty=format:%s"], {
    capture: true,
    shell: false,
  });
  const commits = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("Release "))
    .filter((line) => !line.startsWith("Merge branch "));

  if (commits.length === 0) {
    fail(`No commits found to generate release notes for ${tagName}.`);
  }

  return [
    "## Changes",
    "",
    ...commits.map((line) => `- ${line.replace(/^[a-z]+(?:\([^)]+\))?!?:\s*/i, "")}`),
  ].join("\n");
}

function resolveReleaseNotes(args, tagName) {
  if (args.notesFile) {
    return { type: "file", value: resolveNotesFile(args.notesFile) };
  }
  if (args.message) {
    return { type: "message", value: args.message };
  }

  const sinceTag = args.notesSince || latestReachableTag();
  return { type: "message", value: generatedNotes(sinceTag, tagName), sinceTag };
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

function printDryRun({ oldVersion, newVersion, tagName, notes }) {
  console.log("");
  console.log("Dry run only. No files, commits, tags, pushes, or releases were created.");
  console.log(`Version: ${oldVersion} -> ${newVersion}`);
  console.log(`Tag: ${tagName}`);
  if (notes.sinceTag) {
    console.log(`Generated notes since: ${notes.sinceTag}`);
  }
  console.log("");
  console.log("Release notes:");
  console.log(notes.type === "file" ? fs.readFileSync(notes.value, "utf8").trim() : notes.value);
}

function printRecovery(error) {
  console.error("");
  console.error(`Release failed during ${releaseStep}: ${error.message}`);
  console.error("");
  console.error("Recovery:");
  if (!versionCommitted) {
    console.error("  git checkout -- package.json package-lock.json");
  }
  if (tagCreated && currentTagName) {
    console.error(`  git tag -d ${currentTagName}`);
  }
  if (versionCommitted) {
    console.error("  Inspect the release commit before retrying:");
    console.error("  git log --oneline -3");
  }
  console.error("  After cleanup, rerun the release command from a clean working tree.");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    return;
  }

  const bump = parseBumpArg(args.bumpArg);
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const oldVersion = pkg.version;
  const newVersion = bumpVersion(oldVersion, bump);
  const tagName = `v${newVersion}`;
  currentTagName = tagName;
  const notes = resolveReleaseNotes(args, tagName);

  console.log(`Release: v${oldVersion} -> ${tagName}`);

  if (args.dryRun) {
    printDryRun({ oldVersion, newVersion, tagName, notes });
    return;
  }

  releaseStep = "preflight";
  assertCleanWorkingTree();
  assertTagDoesNotExist(tagName);
  assertGitHubCli();

  releaseStep = "version bump";
  run("Bumping package version", "npm", ["version", newVersion, "--no-git-tag-version"]);
  releaseStep = "build";
  run("Building extension", "npm", ["run", "build"]);
  releaseStep = "zip";
  run("Creating extension zip", "npm", ["run", "zip"]);

  const zipArtifact = findZipArtifact(newVersion);
  if (!zipArtifact) {
    fail("No zip artifact was found in .output after npm run zip.");
  }

  releaseStep = "release commit";
  run("Staging version files", "git", ["add", packagePath, packageLockPath], { shell: false });
  run("Committing version bump", "git", ["commit", "-m", `Release ${tagName}`], { shell: false });
  versionCommitted = true;

  releaseStep = "tag";
  run("Tagging release commit", "git", ["tag", "-a", tagName, "-m", `Release ${tagName}`], {
    shell: false,
  });
  tagCreated = true;

  releaseStep = "push";
  run("Pushing release commit", "git", ["push", "origin", "HEAD"], { shell: false });
  run("Pushing release tag", "git", ["push", "origin", tagName], { shell: false });

  const releaseArgs = ["release", "create", tagName, zipArtifact, "--title", tagName];
  if (notes.type === "file") {
    releaseArgs.push("--notes-file", notes.value);
  } else {
    releaseArgs.push("--notes", notes.value);
  }

  releaseStep = "GitHub release";
  run("Creating GitHub release", "gh", releaseArgs);

  console.log("");
  console.log(`Release ${tagName} created with ${path.relative(rootDir, zipArtifact)} attached.`);
}

try {
  main();
} catch (error) {
  if (error.message.startsWith("Invalid") || error.message.includes("requires")) {
    console.error(`Error: ${error.message}`);
    console.error("");
    printUsage();
  } else {
    printRecovery(error);
  }
  process.exit(1);
}
