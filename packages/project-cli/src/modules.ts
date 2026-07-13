import { existsSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

const CAPABILITIES = new Set(["input", "clock", "random", "eventBus", "assets", "physics"]);

export interface ModuleScaffoldOptions {
  repoRoot: string;
  moduleId: string;
  category?: string;
  description?: string;
  capabilities?: string[];
}

export interface PromoteModuleOptions extends ModuleScaffoldOptions {
  sourcePath: string;
}

export interface ModuleScaffoldResult {
  moduleId: string;
  manifestPath: string;
  sourcePath: string;
}

function moduleSlug(moduleId: string): string {
  if (!moduleId.startsWith("module.")) {
    throw new Error("module id는 module.<slug> 형식이어야 합니다.");
  }
  const slug = moduleId.slice("module.".length);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error("module slug는 소문자, 숫자, 하이픈만 사용할 수 있습니다.");
  }
  return slug;
}

function definitionName(slug: string): string {
  const name = slug.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
  return /^[a-zA-Z_]/.test(name) ? `${name}Definition` : `module${name}Definition`;
}

function validateCapabilities(capabilities: string[]): string[] {
  const unique = [...new Set(capabilities)];
  for (const capability of unique) {
    if (!CAPABILITIES.has(capability)) {
      throw new Error(`알 수 없는 capability입니다: ${capability}`);
    }
  }
  return unique;
}

function createManifest(options: Required<ModuleScaffoldOptions>, slug: string) {
  return {
    schemaVersion: 1,
    id: options.moduleId,
    version: "0.1.0",
    category: options.category,
    description: options.description,
    tags: ["candidate", options.category],
    engine: { name: "phaser", minimumVersion: "4.2.1" },
    minimumSchemaVersion: 1,
    configSchemaId: `config.${slug}`,
    requiredCapabilities: validateCapabilities(options.capabilities),
    emits: [],
    listens: [],
    dependencies: [],
  };
}

function createSource(moduleId: string, slug: string, capabilities: string[]): string {
  return `import type { ModuleDefinition } from "@web-game-maker/module-sdk";

export const ${definitionName(slug)}: ModuleDefinition<Record<string, unknown>> = {
  id: "${moduleId}",
  version: "0.1.0",
  requiredCapabilities: ${JSON.stringify(capabilities)},
  parseConfig(value) {
    if (typeof value !== "object" || value === null) {
      throw new Error("${moduleId} config는 객체여야 합니다.");
    }
    return value as Record<string, unknown>;
  },
  setup() {
    return {
      start() {},
      update() {},
      handle() {},
      destroy() {},
    };
  },
};
`;
}

async function writeScaffold(
  repoRoot: string,
  slug: string,
  manifest: object,
  source: string,
): Promise<ModuleScaffoldResult> {
  const manifestPath = join(repoRoot, "packages/core-modules/manifests", `${slug}.manifest.json`);
  const sourcePath = join(repoRoot, "packages/core-modules/src", `${slug}.ts`);
  if (existsSync(manifestPath) || existsSync(sourcePath)) {
    throw new Error(`이미 존재하는 module scaffold입니다: ${slug}`);
  }
  await mkdir(join(repoRoot, "packages/core-modules/manifests"), { recursive: true });
  await mkdir(join(repoRoot, "packages/core-modules/src"), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(sourcePath, source, "utf8");
  return {
    moduleId: String((manifest as { id: string }).id),
    manifestPath: relative(repoRoot, manifestPath),
    sourcePath: relative(repoRoot, sourcePath),
  };
}

export async function createModuleScaffold(
  options: ModuleScaffoldOptions,
): Promise<ModuleScaffoldResult> {
  const slug = moduleSlug(options.moduleId);
  const capabilities = validateCapabilities(options.capabilities ?? []);
  const resolved: Required<ModuleScaffoldOptions> = {
    repoRoot: options.repoRoot,
    moduleId: options.moduleId,
    category: options.category ?? "custom",
    description: options.description ?? `${options.moduleId} 후보 모듈`,
    capabilities,
  };
  return await writeScaffold(
    options.repoRoot,
    slug,
    createManifest(resolved, slug),
    createSource(options.moduleId, slug, capabilities),
  );
}

export async function promoteGameFeature(
  options: PromoteModuleOptions,
): Promise<ModuleScaffoldResult> {
  const slug = moduleSlug(options.moduleId);
  const absoluteSourcePath = resolve(options.repoRoot, options.sourcePath);
  if (!existsSync(absoluteSourcePath)) {
    throw new Error(`승격할 기능 파일이 없습니다: ${options.sourcePath}`);
  }
  const capabilities = validateCapabilities(options.capabilities ?? []);
  const resolved: Required<ModuleScaffoldOptions> = {
    repoRoot: options.repoRoot,
    moduleId: options.moduleId,
    category: options.category ?? "promoted",
    description: options.description ?? `${basename(options.sourcePath)}에서 승격한 모듈`,
    capabilities,
  };
  const result = await writeScaffold(
    options.repoRoot,
    slug,
    createManifest(resolved, slug),
    await readFile(absoluteSourcePath, "utf8"),
  );
  await cp(absoluteSourcePath, join(options.repoRoot, result.sourcePath), { force: true });
  return result;
}
