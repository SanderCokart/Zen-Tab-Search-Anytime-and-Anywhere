// TODO(zen-tab-search): Zen Tab Search is already published as a listed AMO add-on
// (https://addons.mozilla.org/firefox/addon/zen-tab-search/). Confirm whether this
// project should download unlisted dev builds, listed releases, or use a separate
// AMO add-on ID for forked builds. Update ADDON_ID, output filename, and API
// fields (latest_unlisted_version vs latest_version) once the release channel is decided.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ADDON_ID = "zen-tab-search@extension.example";
const OUTPUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "signed");

function createJwt(issuer, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: issuer,
      jti: Math.random().toString(),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

async function amoFetch(url, issuer, secret) {
  const response = await fetch(url, {
    headers: { Authorization: `JWT ${createJwt(issuer, secret)}` },
  });

  if (!response.ok) {
    throw new Error(`AMO API error ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function main() {
  const issuer = process.env.AMO_JWT_ISSUER;
  const secret = process.env.AMO_JWT_SECRET;

  if (!issuer || !secret) {
    console.error("AMO credentials missing. Run:");
    console.error("  npm run env:use:local");
    console.error("  npm run download-signed");
    process.exit(1);
  }

  const addon = await amoFetch(
    `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(ADDON_ID)}/`,
    issuer,
    secret,
  );

  const version = addon.latest_unlisted_version;
  if (!version) {
    console.error("No unlisted version found on AMO yet.");
    process.exit(1);
  }

  const file = version.file;
  console.log(`Version: ${version.version}`);
  console.log(`Review status: ${file.status}`);
  console.log(`Developer page: ${version.edit_url}`);

  if (file.status !== "public" && !file.is_mozilla_signed_extension) {
    console.log("");
    console.log("Not signed yet. Mozilla is still reviewing this submission.");
    console.log("Check the developer page above, then run this script again later.");
    process.exit(2);
  }

  const downloadResponse = await fetch(file.url, {
    headers: { Authorization: `JWT ${createJwt(issuer, secret)}` },
  });

  if (!downloadResponse.ok) {
    throw new Error(`Download failed ${downloadResponse.status}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `zen-tab-search-${version.version}.xpi`);
  const buffer = Buffer.from(await downloadResponse.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);

  console.log("");
  console.log(`Downloaded signed extension to: ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
