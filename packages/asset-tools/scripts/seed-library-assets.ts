import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { importImageAsset } from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const libraryRoot = join(root, "library");
const fixtureDir = join(root, "packages/asset-tools/tests/fixtures");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const JPG = Buffer.from([
  0xff, 0xd8, 0xff, 0xd9,
]);
const WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56,
  0x50, 0x38, 0x20, 0x0e, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#074"/></svg>\n`;

await mkdir(fixtureDir, { recursive: true });
await writeFile(join(fixtureDir, "sample.png"), PNG);
await writeFile(join(fixtureDir, "sample.jpg"), JPG);
await writeFile(join(fixtureDir, "sample.webp"), WEBP);
await writeFile(join(fixtureDir, "sample.svg"), SVG);

const specs = [
  { file: "sample.png", id: "asset.harbor-pixel-png", tag: "harbor" },
  { file: "sample.jpg", id: "asset.harbor-pixel-jpg", tag: "harbor" },
  { file: "sample.webp", id: "asset.harbor-pixel-webp", tag: "harbor" },
  { file: "sample.svg", id: "asset.harbor-pixel-svg", tag: "harbor" },
] as const;

for (const spec of specs) {
  try {
    await importImageAsset({
      libraryRoot,
      sourcePath: join(fixtureDir, spec.file),
      assetId: spec.id,
      tags: [spec.tag, "sample"],
      name: spec.id,
    });
    console.log(`등록: ${spec.id}`);
  } catch (error) {
    if (
      error instanceof Error &&
      /이미 있습니다/.test(error.message)
    ) {
      console.log(`유지: ${spec.id}`);
      continue;
    }
    throw error;
  }
}
