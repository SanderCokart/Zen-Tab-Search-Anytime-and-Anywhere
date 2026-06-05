import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const rootDir = process.cwd();
const svgPath = path.join(rootDir, "wxt.svg");
const iconDir = path.join(rootDir, "public", "icon");
const sizes = [16, 32, 48, 96, 128];

if (!fs.existsSync(svgPath)) {
  console.warn("wxt.svg not found, skipping icon generation");
  process.exit(0);
}

fs.mkdirSync(iconDir, { recursive: true });

for (const size of sizes) {
  const outputPath = path.join(iconDir, `${size}.png`);
  await sharp(svgPath).resize(size, size).png().toFile(outputPath);
  console.log(`Generated ${outputPath}`);
}
