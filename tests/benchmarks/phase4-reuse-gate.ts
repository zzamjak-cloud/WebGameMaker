import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkBaseline,
  measureReuse,
  type ReuseMeasurement,
} from "./measure-reuse.js";
import { parseProjectBundle } from "../../packages/schema/src/index.js";

export interface Phase4ReuseGateReport {
  phase1: Pick<ReuseMeasurement, "commonGameplayLoc" | "manualSetupSteps">;
  phase4: Pick<ReuseMeasurement, "commonGameplayLoc" | "manualSetupSteps">;
  locReductionRatio: number;
  stepReductionRatio: number;
  requiredModules: readonly string[];
}

const REQUIRED_SHARED_MODULES = [
  "module.player-move-2d",
  "module.camera-follow",
  "module.health",
  "module.enemy-patrol",
  "module.enemy-chase",
  "module.collision-layer",
] as const;

const DEFAULT_PHASE1_BASELINE = "tests/benchmarks/reuse-baseline.phase-1.json";
const DEFAULT_PHASE4_BASELINE = "tests/benchmarks/reuse-baseline.phase-4.json";
const DEFAULT_PHASE4_SOURCE = "games/relay-ward/src/gameplay";
const DEFAULT_PHASE4_RECIPE = "games/relay-ward/reuse-recipe.json";

function toPosixPath(value: string): string {
  return value.split(sep).join("/");
}

function resolveInsideRepo(repoRoot: string, path: string): string {
  const resolved = resolve(repoRoot, path);
  const relativePath = relative(repoRoot, resolved);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`저장소 밖 경로입니다: ${path}`);
  }
  return resolved;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function readBundle(repoRoot: string, gameRoot: string) {
  const root = resolveInsideRepo(repoRoot, gameRoot);
  const sceneRoot = resolve(root, "scenes");
  const sceneFiles = (await readdir(sceneRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".scene.json"))
    .map((entry) => entry.name)
    .sort();
  return parseProjectBundle({
    project: await readJson(resolve(root, "game.project.json")),
    scenes: await Promise.all(
      sceneFiles.map((fileName) => readJson(resolve(sceneRoot, fileName))),
    ),
  });
}

function collectModuleIds(bundle: ReturnType<typeof parseProjectBundle>): Set<string> {
  return new Set(
    bundle.scenes.flatMap((scene) =>
      scene.entities.flatMap((entity) =>
        entity.modules
          .filter((binding) => binding.enabled)
          .map((binding) => binding.moduleId),
      ),
    ),
  );
}

async function collectTypeScriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      continue;
    }
    if (stat.isDirectory()) {
      if (!["dist", "generated", "node_modules"].includes(entry.name)) {
        files.push(...(await collectTypeScriptFiles(path)));
      }
      continue;
    }
    if (
      stat.isFile() &&
      /\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts") &&
      !/\.(test|spec)\.tsx?$/.test(entry.name)
    ) {
      files.push(path);
    }
  }
  return files.sort();
}

function importSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(/\bfrom\s+["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1]!);
}

async function assertNoForbiddenGameImports(repoRoot: string): Promise<void> {
  const relayRoot = resolveInsideRepo(repoRoot, "games/relay-ward/src");
  const files = await collectTypeScriptFiles(relayRoot);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const forbidden = importSpecifiers(source).filter((specifier) =>
      specifier.includes("floodgate-07"),
    );
    if (forbidden.length > 0) {
      throw new Error(
        `${toPosixPath(relative(repoRoot, file))}에서 첫 게임 import를 발견했습니다: ${forbidden.join(", ")}`,
      );
    }
  }
}

function codeLines(source: string): string[] {
  return source
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"));
}

async function assertNoLongDuplicateBlocks(
  repoRoot: string,
  leftRoot: string,
  rightRoot: string,
  minimumLines: number,
): Promise<void> {
  const leftFiles = await collectTypeScriptFiles(resolveInsideRepo(repoRoot, leftRoot));
  const rightFiles = await collectTypeScriptFiles(resolveInsideRepo(repoRoot, rightRoot));
  const blocks = new Map<string, string>();
  for (const file of leftFiles) {
    const lines = codeLines(await readFile(file, "utf8"));
    for (let index = 0; index <= lines.length - minimumLines; index += 1) {
      blocks.set(
        lines.slice(index, index + minimumLines).join("\n"),
        toPosixPath(relative(repoRoot, file)),
      );
    }
  }
  for (const file of rightFiles) {
    const lines = codeLines(await readFile(file, "utf8"));
    for (let index = 0; index <= lines.length - minimumLines; index += 1) {
      const key = lines.slice(index, index + minimumLines).join("\n");
      const duplicate = blocks.get(key);
      if (duplicate) {
        throw new Error(
          `20줄 이상 중복 게임 로직을 발견했습니다: ${duplicate} / ${toPosixPath(relative(repoRoot, file))}`,
        );
      }
    }
  }
}

async function assertRequiredModules(repoRoot: string): Promise<void> {
  for (const gameRoot of ["games/floodgate-07", "games/relay-ward"]) {
    const modules = collectModuleIds(await readBundle(repoRoot, gameRoot));
    const missing = REQUIRED_SHARED_MODULES.filter((moduleId) => !modules.has(moduleId));
    if (missing.length > 0) {
      throw new Error(`${gameRoot} 필수 공용 모듈 누락: ${missing.join(", ")}`);
    }
  }
}

export async function verifyPhase4ReuseGate(
  repoRoot = process.cwd(),
): Promise<Phase4ReuseGateReport> {
  const phase1 = JSON.parse(
    await readFile(resolveInsideRepo(repoRoot, DEFAULT_PHASE1_BASELINE), "utf8"),
  ) as ReuseMeasurement;
  const phase4 = await measureReuse({
    repoRoot,
    sourceRoot: DEFAULT_PHASE4_SOURCE,
    recipePath: DEFAULT_PHASE4_RECIPE,
  });
  await checkBaseline(
    resolveInsideRepo(repoRoot, DEFAULT_PHASE4_BASELINE),
    phase4,
  );
  const locReductionRatio =
    1 - phase4.commonGameplayLoc / phase1.commonGameplayLoc;
  const stepReductionRatio =
    1 - phase4.manualSetupSteps / phase1.manualSetupSteps;
  if (locReductionRatio < 0.5 || stepReductionRatio < 0.5) {
    throw new Error(
      `Phase 4 재사용 감소율 부족: LOC ${(locReductionRatio * 100).toFixed(1)}%, 단계 ${(stepReductionRatio * 100).toFixed(1)}%`,
    );
  }
  await assertRequiredModules(repoRoot);
  await assertNoForbiddenGameImports(repoRoot);
  await assertNoLongDuplicateBlocks(
    repoRoot,
    "games/floodgate-07/src/features",
    "games/relay-ward/src/gameplay",
    20,
  );
  return {
    phase1,
    phase4,
    locReductionRatio,
    stepReductionRatio,
    requiredModules: REQUIRED_SHARED_MODULES,
  };
}

async function runCli(): Promise<void> {
  const report = await verifyPhase4ReuseGate(process.cwd());
  process.stdout.write(
    `Phase 4 재사용 게이트 통과: LOC ${(report.locReductionRatio * 100).toFixed(1)}% 감소, 단계 ${(report.stepReductionRatio * 100).toFixed(1)}% 감소\n`,
  );
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFilePath) {
  runCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
