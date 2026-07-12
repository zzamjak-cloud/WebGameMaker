#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { importImageAsset } from "@web-game-maker/asset-tools";

import { catalogSearch } from "./catalog.js";
import { createGameProject } from "./create-game.js";
import { validateDesignLibrary } from "./designs.js";
import { validateProjectPath } from "./validate.js";

function printUsage(): void {
  console.error(`사용법:
  pnpm wgm validate <프로젝트 경로|bundle JSON>
  pnpm wgm catalog search --type design|asset|module [--tag <tag>] [--text <q>]
  pnpm wgm asset import <path> --id <asset.id> [--tag <tag>]...
  pnpm wgm game create <game.id> [--name <name>]
  pnpm wgm designs validate
  pnpm wgm dev [player]
  pnpm wgm build player`);
}

function getFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1];
}

function getFlags(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) {
      values.push(args[index + 1]!);
      index += 1;
    }
  }
  return values;
}

function repoRootFromCwd(): string {
  return resolve(process.cwd());
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<number> {
  return await new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => resolvePromise(code ?? 1));
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const [command, subcommand, ...rest] = argv;
  const root = repoRootFromCwd();

  if (command === "validate" && subcommand) {
    const result = await validateProjectPath(resolve(root, subcommand), {
      designsRoot: resolve(root, "library/designs"),
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const issuePath =
          issue.path.length > 0 ? issue.path.join(".") : "bundle";
        console.error(`${issuePath}: ${issue.message}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log(
      `프로젝트 검증 성공: ${result.data.project.id} (design ${result.data.project.designId}, 장면 ${result.data.scenes.length}개)`,
    );
    return;
  }

  if (command === "designs" && subcommand === "validate") {
    const { designs, issues } = await validateDesignLibrary(
      resolve(root, "library/designs"),
    );
    if (issues.length > 0) {
      for (const issue of issues) {
        console.error(`${issue.path}: ${issue.message}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`기획 문서 검증 성공: ${designs.length}개`);
    return;
  }

  if (command === "catalog" && subcommand === "search") {
    const type = getFlag(rest, "--type");
    if (type !== "design" && type !== "asset" && type !== "module") {
      printUsage();
      process.exitCode = 2;
      return;
    }
    const tag = getFlag(rest, "--tag");
    const text = getFlag(rest, "--text");
    const hits = await catalogSearch({
      repoRoot: root,
      type,
      ...(tag === undefined ? {} : { tag }),
      ...(text === undefined ? {} : { text }),
    });
    for (const hit of hits) {
      console.log(`${hit.type}\t${hit.id}\t${hit.labels.join(",")}`);
    }
    console.log(`검색 결과 ${hits.length}개`);
    return;
  }

  if (command === "asset" && subcommand === "import") {
    const sourcePath = rest[0];
    const assetId = getFlag(rest, "--id");
    if (!sourcePath || !assetId) {
      printUsage();
      process.exitCode = 2;
      return;
    }
    const name = getFlag(rest, "--name");
    const result = await importImageAsset({
      libraryRoot: resolve(root, "library"),
      sourcePath: resolve(root, sourcePath),
      assetId,
      tags: getFlags(rest, "--tag"),
      ...(name === undefined ? {} : { name }),
    });
    console.log(`에셋 등록 성공: ${result.asset.id} (${result.asset.mimeType})`);
    return;
  }

  if (command === "game" && subcommand === "create") {
    const gameId = rest[0];
    if (!gameId) {
      printUsage();
      process.exitCode = 2;
      return;
    }
    const name = getFlag(rest, "--name");
    const templateId = getFlag(rest, "--template");
    const created = await createGameProject({
      repoRoot: root,
      gameId,
      ...(name === undefined ? {} : { name }),
      ...(templateId === undefined ? {} : { templateId }),
    });
    console.log(`게임 생성: ${created.gameDir} (design ${created.designId})`);
    return;
  }

  if (command === "dev") {
    const code = await runCommand(
      "pnpm",
      ["--filter", "@web-game-maker/player", "dev"],
      root,
    );
    process.exitCode = code;
    return;
  }

  if (command === "build" && (subcommand === "player" || subcommand === undefined)) {
    const code = await runCommand(
      "pnpm",
      ["--filter", "@web-game-maker/player", "build"],
      root,
    );
    process.exitCode = code;
    return;
  }

  printUsage();
  process.exitCode = 2;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
