import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import * as ts from "typescript";

const METRIC_VERSION = "reuse-v1";
const DEFAULT_GAME_ROOT = "games/floodgate-07";
const DEFAULT_RECIPE_PATH = `${DEFAULT_GAME_ROOT}/reuse-recipe.json`;
const DEFAULT_BASELINE_PATH = "tests/benchmarks/reuse-baseline.json";
const DEFAULT_SOURCE_ROOT = `${DEFAULT_GAME_ROOT}/src/features`;

const ACTION_KINDS = new Set(["file", "code", "test"] as const);

type ReuseActionKind = "file" | "code" | "test";

export interface ReuseAction {
  id: string;
  kind: ReuseActionKind;
  path: string;
}

export interface ReuseRecipe {
  schemaVersion: 1;
  gameId: string;
  acceptanceProfile: string;
  cleanScaffold: string;
  actions: ReuseAction[];
  verification: {
    argv: string[];
    expectedExitCode: number;
  };
}

export interface GameplayFileMeasurement {
  path: string;
  loc: number;
  digest: string;
}

export interface GameplayLocMeasurement {
  commonGameplayLoc: number;
  sourceDigest: string;
  files: GameplayFileMeasurement[];
}

export interface ReuseMeasurement {
  schemaVersion: 1;
  metricVersion: typeof METRIC_VERSION;
  baselineId: string;
  gameId: string;
  acceptanceProfile: string;
  commonGameplayLoc: number;
  manualSetupSteps: number;
  inputs: {
    sourceRoot: string;
    recipe: string;
    sourceDigest: string;
    recipeDigest: string;
  };
  breakdown: {
    files: GameplayFileMeasurement[];
    actionIds: string[];
  };
}

interface MeasureReuseOptions {
  repoRoot?: string;
  sourceRoot?: string;
  recipePath?: string;
}

interface CliOptions {
  mode: "check" | "write";
  sourceRoot: string;
  recipePath: string;
  baselinePath: string;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function toPosixPath(value: string): string {
  return value.split(sep).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void {
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new Error(`${label}에 허용되지 않은 필드가 있습니다: ${unexpected.join(", ")}`);
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label}은 비어 있지 않은 문자열이어야 합니다.`);
  }
  return value;
}

function normalizeRepoRelativePath(value: unknown, label: string): string {
  const input = requireNonEmptyString(value, label).replaceAll("\\", "/");
  if (isAbsolute(input) || input.startsWith("/")) {
    throw new Error(`${label}은 저장소 기준 상대 경로여야 합니다: ${input}`);
  }

  const parts = input.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${label}에 빈 구간, 현재 경로 또는 상위 경로를 사용할 수 없습니다: ${input}`);
  }

  return parts.join("/");
}

function resolveInsideRepo(repoRoot: string, repoRelativePath: string, label: string): string {
  const resolvedPath = resolve(repoRoot, repoRelativePath);
  const relativePath = relative(repoRoot, resolvedPath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`${label}이 저장소 밖을 가리킵니다: ${repoRelativePath}`);
  }
  return resolvedPath;
}

export function parseReuseRecipe(value: unknown): ReuseRecipe {
  if (!isRecord(value)) {
    throw new Error("reuse recipe는 객체여야 합니다.");
  }
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "gameId",
      "acceptanceProfile",
      "cleanScaffold",
      "actions",
      "verification",
    ],
    "reuse recipe",
  );

  if (value.schemaVersion !== 1) {
    throw new Error("reuse recipe schemaVersion은 1이어야 합니다.");
  }
  const gameId = requireNonEmptyString(value.gameId, "gameId");
  const acceptanceProfile = requireNonEmptyString(
    value.acceptanceProfile,
    "acceptanceProfile",
  );
  const cleanScaffold = requireNonEmptyString(value.cleanScaffold, "cleanScaffold");

  if (!Array.isArray(value.actions) || value.actions.length === 0) {
    throw new Error("actions는 하나 이상의 action을 가져야 합니다.");
  }

  const actionIds = new Set<string>();
  const actionPaths = new Set<string>();
  const actions = value.actions.map((actionValue, index): ReuseAction => {
    if (!isRecord(actionValue)) {
      throw new Error(`actions[${index}]는 객체여야 합니다.`);
    }
    assertExactKeys(actionValue, ["id", "kind", "path"], `actions[${index}]`);
    const id = requireNonEmptyString(actionValue.id, `actions[${index}].id`);
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) {
      throw new Error(`actions[${index}].id 형식이 올바르지 않습니다: ${id}`);
    }
    if (actionIds.has(id)) {
      throw new Error(`중복된 action ID입니다: ${id}`);
    }
    actionIds.add(id);

    if (typeof actionValue.kind !== "string" || !ACTION_KINDS.has(actionValue.kind as ReuseActionKind)) {
      throw new Error(`actions[${index}].kind가 올바르지 않습니다: ${String(actionValue.kind)}`);
    }
    const path = normalizeRepoRelativePath(actionValue.path, `actions[${index}].path`);
    if (actionPaths.has(path)) {
      throw new Error(`중복된 action 경로입니다: ${path}`);
    }
    actionPaths.add(path);

    return { id, kind: actionValue.kind as ReuseActionKind, path };
  });

  if (!isRecord(value.verification)) {
    throw new Error("verification은 객체여야 합니다.");
  }
  assertExactKeys(value.verification, ["argv", "expectedExitCode"], "verification");
  if (
    !Array.isArray(value.verification.argv) ||
    value.verification.argv.length === 0 ||
    value.verification.argv.some(
      (argument) => typeof argument !== "string" || argument.length === 0,
    )
  ) {
    throw new Error("verification.argv는 비어 있지 않은 문자열 배열이어야 합니다.");
  }
  if (!Number.isInteger(value.verification.expectedExitCode)) {
    throw new Error("verification.expectedExitCode는 정수여야 합니다.");
  }

  return {
    schemaVersion: 1,
    gameId,
    acceptanceProfile,
    cleanScaffold,
    actions,
    verification: {
      argv: [...value.verification.argv] as string[],
      expectedExitCode: value.verification.expectedExitCode as number,
    },
  };
}

function isExcludedGameplayPath(relativePath: string): boolean {
  const segments = relativePath.split("/");
  const fileName = segments.at(-1) ?? "";
  return (
    segments.some((segment) => segment === "__tests__" || segment === "generated") ||
    fileName.endsWith(".d.ts") ||
    /\.(?:test|spec)\.tsx?$/.test(fileName) ||
    /\.generated\.tsx?$/.test(fileName) ||
    !/\.tsx?$/.test(fileName)
  );
}

async function collectGameplayFiles(
  sourceRootPath: string,
  currentPath = sourceRootPath,
): Promise<string[]> {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) => compareCodeUnits(left.name, right.name))) {
    const absolutePath = resolve(currentPath, entry.name);
    const relativePath = toPosixPath(relative(sourceRootPath, absolutePath));
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      const segments = relativePath.split("/");
      if (segments.some((segment) => segment === "__tests__" || segment === "generated")) {
        continue;
      }
      files.push(...(await collectGameplayFiles(sourceRootPath, absolutePath)));
    } else if (entry.isFile() && !isExcludedGameplayPath(relativePath)) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) =>
    compareCodeUnits(
      toPosixPath(relative(sourceRootPath, left)),
      toPosixPath(relative(sourceRootPath, right)),
    ),
  );
}

function isIgnoredTrivia(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.WhitespaceTrivia ||
    kind === ts.SyntaxKind.NewLineTrivia ||
    kind === ts.SyntaxKind.SingleLineCommentTrivia ||
    kind === ts.SyntaxKind.MultiLineCommentTrivia ||
    kind === ts.SyntaxKind.ShebangTrivia ||
    kind === ts.SyntaxKind.ConflictMarkerTrivia
  );
}

export function countCodeLines(source: string, scriptKind = ts.ScriptKind.TS): number {
  const normalizedSource = normalizeLineEndings(source);
  const sourceFile = ts.createSourceFile(
    "measurement.ts",
    normalizedSource,
    ts.ScriptTarget.Latest,
    false,
    scriptKind,
  );
  const lineStarts = sourceFile.getLineStarts();
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    scriptKind === ts.ScriptKind.TSX ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    normalizedSource,
  );
  const codeLines = new Set<number>();

  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (isIgnoredTrivia(kind)) {
      continue;
    }

    const tokenStart = scanner.getTokenPos();
    const tokenEnd = scanner.getTextPos();
    const startLine = sourceFile.getLineAndCharacterOfPosition(tokenStart).line;
    const endLine = sourceFile.getLineAndCharacterOfPosition(Math.max(tokenStart, tokenEnd - 1)).line;

    // 여러 줄 문자열·JSX 안의 실제 문자만 세어 물리적으로 빈 행이 LOC에 섞이지 않게 한다.
    for (let line = startLine; line <= endLine; line += 1) {
      const lineStart = Math.max(tokenStart, lineStarts[line] ?? tokenStart);
      const nextLineStart = lineStarts[line + 1] ?? normalizedSource.length;
      const lineEnd = Math.min(tokenEnd, nextLineStart);
      if (/\S/.test(normalizedSource.slice(lineStart, lineEnd))) {
        codeLines.add(line);
      }
    }
  }

  return codeLines.size;
}

export async function measureGameplayLoc(
  repoRoot: string,
  sourceRoot: string,
): Promise<GameplayLocMeasurement> {
  const normalizedSourceRoot = normalizeRepoRelativePath(sourceRoot, "sourceRoot");
  const sourceRootPath = resolveInsideRepo(repoRoot, normalizedSourceRoot, "sourceRoot");
  const rootStat = await lstat(sourceRootPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`sourceRoot은 실제 디렉터리여야 합니다: ${normalizedSourceRoot}`);
  }

  const absoluteFiles = await collectGameplayFiles(sourceRootPath);
  if (absoluteFiles.length === 0) {
    throw new Error(`측정할 gameplay TypeScript 파일이 없습니다: ${normalizedSourceRoot}`);
  }

  const files: GameplayFileMeasurement[] = [];
  const sourceDigestParts: string[] = [];
  for (const absolutePath of absoluteFiles) {
    const relativeToRepo = toPosixPath(relative(repoRoot, absolutePath));
    const source = normalizeLineEndings(await readFile(absolutePath, "utf8"));
    const fileDigest = digest(source);
    const loc = countCodeLines(
      source,
      relativeToRepo.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    files.push({ path: relativeToRepo, loc, digest: fileDigest });
    sourceDigestParts.push(`${relativeToRepo}\0${source}\0`);
  }

  return {
    commonGameplayLoc: files.reduce((sum, file) => sum + file.loc, 0),
    sourceDigest: digest(sourceDigestParts.join("")),
    files,
  };
}

async function validateActionTargets(repoRoot: string, recipe: ReuseRecipe): Promise<void> {
  for (const action of recipe.actions) {
    const actionPath = resolveInsideRepo(repoRoot, action.path, `action ${action.id}`);
    let actionStat;
    try {
      actionStat = await lstat(actionPath);
    } catch {
      throw new Error(`action 대상 파일을 찾을 수 없습니다: ${action.id} -> ${action.path}`);
    }
    if (!actionStat.isFile() || actionStat.isSymbolicLink()) {
      throw new Error(`action 대상은 실제 파일이어야 합니다: ${action.id} -> ${action.path}`);
    }
  }
}

export async function measureReuse(
  options: MeasureReuseOptions = {},
): Promise<ReuseMeasurement> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const sourceRoot = normalizeRepoRelativePath(
    options.sourceRoot ?? DEFAULT_SOURCE_ROOT,
    "sourceRoot",
  );
  const recipePath = normalizeRepoRelativePath(
    options.recipePath ?? DEFAULT_RECIPE_PATH,
    "recipePath",
  );
  const recipeAbsolutePath = resolveInsideRepo(repoRoot, recipePath, "recipePath");
  const recipe = parseReuseRecipe(JSON.parse(await readFile(recipeAbsolutePath, "utf8")) as unknown);
  await validateActionTargets(repoRoot, recipe);

  const gameplay = await measureGameplayLoc(repoRoot, sourceRoot);
  const canonicalRecipe = `${JSON.stringify(recipe)}\n`;

  return {
    schemaVersion: 1,
    metricVersion: METRIC_VERSION,
    baselineId: `phase1.${recipe.gameId}.pre-extraction`,
    gameId: recipe.gameId,
    acceptanceProfile: recipe.acceptanceProfile,
    commonGameplayLoc: gameplay.commonGameplayLoc,
    manualSetupSteps: recipe.actions.length,
    inputs: {
      sourceRoot,
      recipe: recipePath,
      sourceDigest: gameplay.sourceDigest,
      recipeDigest: digest(canonicalRecipe),
    },
    breakdown: {
      files: gameplay.files,
      actionIds: recipe.actions.map((action) => action.id),
    },
  };
}

export function formatMeasurement(measurement: ReuseMeasurement): string {
  return `${JSON.stringify(measurement, null, 2)}\n`;
}

export async function writeBaseline(
  baselinePath: string,
  measurement: ReuseMeasurement,
): Promise<void> {
  await mkdir(dirname(baselinePath), { recursive: true });
  await writeFile(baselinePath, formatMeasurement(measurement), "utf8");
}

export async function checkBaseline(
  baselinePath: string,
  measurement: ReuseMeasurement,
): Promise<void> {
  let baseline: unknown;
  try {
    baseline = JSON.parse(await readFile(baselinePath, "utf8")) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `재사용 기준선을 읽을 수 없습니다. --write-baseline으로 명시적으로 생성하세요: ${reason}`,
      { cause: error },
    );
  }

  if (JSON.stringify(baseline) !== JSON.stringify(measurement)) {
    throw new Error(
      `재사용 기준선 drift를 발견했습니다. 의도한 변경이면 --write-baseline으로 갱신하세요.\n현재 측정: commonGameplayLoc=${measurement.commonGameplayLoc}, manualSetupSteps=${measurement.manualSetupSteps}`,
    );
  }
}

function readFlagValue(arguments_: string[], index: number, flag: string): string {
  const value = arguments_[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} 뒤에 경로가 필요합니다.`);
  }
  return value;
}

export function parseCliOptions(arguments_: string[]): CliOptions {
  let mode: CliOptions["mode"] = "check";
  let sourceRoot = DEFAULT_SOURCE_ROOT;
  let recipePath = DEFAULT_RECIPE_PATH;
  let baselinePath = DEFAULT_BASELINE_PATH;
  let modeWasSelected = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--") {
      continue;
    }
    if (argument === "--check" || argument === "--write-baseline") {
      if (modeWasSelected) {
        throw new Error("--check와 --write-baseline은 함께 사용할 수 없습니다.");
      }
      mode = argument === "--write-baseline" ? "write" : "check";
      modeWasSelected = true;
      continue;
    }
    if (argument === "--source-root") {
      sourceRoot = readFlagValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--recipe") {
      recipePath = readFlagValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--baseline") {
      baselinePath = readFlagValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    throw new Error(`알 수 없는 옵션입니다: ${String(argument)}`);
  }

  return {
    mode,
    sourceRoot: normalizeRepoRelativePath(sourceRoot, "sourceRoot"),
    recipePath: normalizeRepoRelativePath(recipePath, "recipePath"),
    baselinePath: normalizeRepoRelativePath(baselinePath, "baselinePath"),
  };
}

async function runCli(): Promise<void> {
  const repoRoot = process.cwd();
  const options = parseCliOptions(process.argv.slice(2));
  const measurement = await measureReuse({
    repoRoot,
    sourceRoot: options.sourceRoot,
    recipePath: options.recipePath,
  });
  const baselinePath = resolveInsideRepo(repoRoot, options.baselinePath, "baselinePath");

  if (options.mode === "write") {
    await writeBaseline(baselinePath, measurement);
    process.stdout.write(`재사용 기준선을 기록했습니다: ${options.baselinePath}\n`);
  } else {
    await checkBaseline(baselinePath, measurement);
    process.stdout.write(`재사용 기준선과 일치합니다: ${options.baselinePath}\n`);
  }
  process.stdout.write(
    `commonGameplayLoc=${measurement.commonGameplayLoc}\nmanualSetupSteps=${measurement.manualSetupSteps}\n`,
  );
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFilePath) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
