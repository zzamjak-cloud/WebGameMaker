import { rebuildAssetCatalog } from "@web-game-maker/asset-tools";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { searchDesigns, validateDesignLibrary } from "./designs.js";

export interface CatalogHit {
  type: "design" | "asset" | "module";
  id: string;
  labels: string[];
  path?: string;
}

async function listModuleIds(repoRoot: string): Promise<CatalogHit[]> {
  const manifestDir = join(repoRoot, "packages/core-modules/manifests");
  try {
    const files = (await readdir(manifestDir))
      .filter((name) => name.endsWith(".manifest.json"))
      .sort();
    return files.map((fileName) => ({
      type: "module" as const,
      id: `module.${fileName.replace(/\.manifest\.json$/, "")}`,
      labels: ["p0"],
      path: join("packages/core-modules/manifests", fileName),
    }));
  } catch {
    return [];
  }
}

export async function catalogSearch(options: {
  repoRoot: string;
  type: "design" | "asset" | "module";
  tag?: string;
  text?: string;
}): Promise<CatalogHit[]> {
  const repoRoot = resolve(options.repoRoot);
  if (options.type === "design") {
    const { designs, issues } = await validateDesignLibrary(
      join(repoRoot, "library/designs"),
    );
    if (issues.length > 0) {
      throw new Error(issues.map((issue) => issue.message).join("\n"));
    }
    const query: { tag?: string; text?: string } = {};
    if (options.tag !== undefined) {
      query.tag = options.tag;
    }
    if (options.text !== undefined) {
      query.text = options.text;
    }
    return searchDesigns(designs, query).map((entry) => ({
      type: "design",
      id: entry.id,
      labels: entry.tags,
      path: entry.path,
    }));
  }

  if (options.type === "asset") {
    const catalog = await rebuildAssetCatalog(join(repoRoot, "library"));
    return catalog.assets
      .filter((asset) => {
        if (options.tag && !asset.tags.includes(options.tag)) {
          return false;
        }
        if (
          options.text &&
          !`${asset.id} ${asset.name}`.toLowerCase().includes(options.text.toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .map((asset) => ({
        type: "asset" as const,
        id: asset.id,
        labels: asset.tags,
        path: asset.path,
      }));
  }

  return (await listModuleIds(repoRoot)).filter((module) => {
    if (options.tag && !module.labels.includes(options.tag)) {
      return false;
    }
    if (
      options.text &&
      !module.id.toLowerCase().includes(options.text.toLowerCase())
    ) {
      return false;
    }
    return true;
  });
}
