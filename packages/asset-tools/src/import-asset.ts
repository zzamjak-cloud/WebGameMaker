import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import { AssetSchema, type Asset } from "@web-game-maker/schema";

import {
  assertMimeMatchesFormat,
  detectImageFormat,
  type DetectedImageFormat,
} from "./detect.js";
import { sanitizeSvg } from "./sanitize-svg.js";

export interface AssetCatalogEntry {
  id: string;
  name: string;
  type: "image";
  mimeType: string;
  extension: string;
  sha256: string;
  tags: string[];
  path: string;
}

export interface AssetCatalog {
  schemaVersion: 1;
  generatedBy: "asset-tools";
  assets: AssetCatalogEntry[];
}

export interface ImportAssetOptions {
  libraryRoot: string;
  sourcePath: string;
  assetId: string;
  name?: string;
  tags?: string[];
  license?: string;
}

export class AssetImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetImportError";
  }
}

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function toPosix(value: string): string {
  return value.split("\\").join("/");
}

function folderNameFromId(assetId: string): string {
  return assetId.replace(/^asset\./, "").replaceAll(".", "-");
}

export async function writeAssetCatalog(
  libraryRoot: string,
  catalog: AssetCatalog,
): Promise<string> {
  const catalogDir = join(libraryRoot, "catalogs");
  await mkdir(catalogDir, { recursive: true });
  const catalogPath = join(catalogDir, "assets.catalog.json");
  const normalized: AssetCatalog = {
    schemaVersion: 1,
    generatedBy: "asset-tools",
    assets: [...catalog.assets].sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
  await writeFile(`${catalogPath}`, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return catalogPath;
}

export async function rebuildAssetCatalog(libraryRoot: string): Promise<AssetCatalog> {
  const assetsRoot = join(libraryRoot, "assets");
  const entries: AssetCatalogEntry[] = [];
  let folders: string[];
  try {
    folders = (await readdir(assetsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    folders = [];
  }

  for (const folder of folders) {
    const sidecarPath = join(assetsRoot, folder, "asset.json");
    const asset = AssetSchema.parse(JSON.parse(await readFile(sidecarPath, "utf8")));
    entries.push({
      id: asset.id,
      name: asset.name,
      type: "image",
      mimeType: asset.mimeType,
      extension: asset.extension,
      sha256: asset.sha256,
      tags: asset.tags,
      path: toPosix(join("assets", folder)),
    });
  }

  const catalog: AssetCatalog = {
    schemaVersion: 1,
    generatedBy: "asset-tools",
    assets: entries,
  };
  await writeAssetCatalog(libraryRoot, catalog);
  return catalog;
}

export async function importImageAsset(
  options: ImportAssetOptions,
): Promise<{ asset: Asset; folder: string; catalog: AssetCatalog }> {
  const libraryRoot = resolve(options.libraryRoot);
  const sourcePath = resolve(options.sourcePath);
  const bytes = new Uint8Array(await readFile(sourcePath));
  const detected = detectImageFormat(bytes);
  assertMimeMatchesFormat(detected.mimeType, detected.format);

  let payload = bytes;
  if (detected.format === "svg") {
    const sanitized = sanitizeSvg(Buffer.from(bytes).toString("utf8"));
    payload = new Uint8Array(Buffer.from(sanitized, "utf8"));
  }

  const sha256 = digest(payload);
  const catalog = await rebuildAssetCatalog(libraryRoot);
  const duplicate = catalog.assets.find((entry) => entry.sha256 === sha256);
  if (duplicate) {
    throw new AssetImportError(`동일 해시 에셋이 이미 있습니다: ${duplicate.id}`);
  }
  if (catalog.assets.some((entry) => entry.id === options.assetId)) {
    throw new AssetImportError(`에셋 ID가 이미 있습니다: ${options.assetId}`);
  }

  const folder = folderNameFromId(options.assetId);
  const targetDir = join(libraryRoot, "assets", folder);
  await mkdir(targetDir, { recursive: true });
  const sourceName = `original.${detected.extension}`;
  await writeFile(join(targetDir, sourceName), payload);

  // 썸네일은 Phase 3에서 원본 경로를 기록만 하고, 실제 리샘플은 Phase 6으로 미룬다.
  const thumbnailName = `thumbnail.${detected.extension}`;
  await writeFile(join(targetDir, thumbnailName), payload);

  const asset: Asset = AssetSchema.parse({
    schemaVersion: 1,
    id: options.assetId,
    name: options.name ?? basename(sourcePath, extname(sourcePath)),
    type: "image",
    mimeType: detected.mimeType,
    extension: detected.extension,
    byteSize: payload.byteLength,
    sha256,
    tags: options.tags ?? [],
    ...(options.license === undefined ? {} : { license: options.license }),
  });
  await writeFile(join(targetDir, "asset.json"), `${JSON.stringify(asset, null, 2)}\n`);

  const nextCatalog = await rebuildAssetCatalog(libraryRoot);
  return { asset, folder, catalog: nextCatalog };
}

export function listSupportedFormats(): DetectedImageFormat[] {
  return ["png", "jpg", "webp", "svg"];
}
