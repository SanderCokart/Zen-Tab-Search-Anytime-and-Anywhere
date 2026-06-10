// TODO(zen-tab-search): Add a source icon for Zen Tab Search (upstream used icons/icon-512.png).
// Place icon.png in the repo root, or point sourcePath at the upstream asset, then rerun:
//   npm run generate-icons
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const rootDir = process.cwd();
const sourcePath = path.join(rootDir, "icon.png");
const iconDir = path.join(rootDir, "public", "icon");
const sizes = [16, 32, 48, 96, 128];

if (!fs.existsSync(sourcePath)) {
  console.warn("icon.png not found, skipping icon generation");
  process.exit(0);
}

fs.mkdirSync(iconDir, { recursive: true });

for (const size of sizes) {
  const outputPath = path.join(iconDir, `${size}.png`);
  await sharp(sourcePath).resize(size, size).png().toFile(outputPath);
  console.log(`Generated ${outputPath}`);
}
