import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  checkBaseline,
  measureGameplayLoc,
  measureReuse,
  parseCliOptions,
  parseReuseRecipe,
  writeBaseline,
} from "./measure-reuse.js";

async function createFile(root: string, path: string, content: string): Promise<void> {
  const absolutePath = join(root, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

async function createFixtureRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "wgm-reuse-"));
  await createFile(
    root,
    "games/floodgate-07/src/features/player.ts",
    [
      "// 주석 전용 행",
      "const speed = 10; // inline comment",
      "",
      "export function move(distance: number) {",
      "  /* block comment */",
      "  return speed * distance;",
      "}",
      "",
    ].join("\r\n"),
  );
  await createFile(
    root,
    "games/floodgate-07/src/features/z-health.ts",
    "export const maximum =\n  100;\n",
  );
  await createFile(
    root,
    "games/floodgate-07/src/features/ai/chase.ts",
    "export const chase = true;\n",
  );
  await createFile(
    root,
    "games/floodgate-07/src/features/player.test.ts",
    "throw new Error('제외');\n",
  );
  await createFile(
    root,
    "games/floodgate-07/src/features/generated/schema.ts",
    "export const generated = true;\n",
  );
  await createFile(
    root,
    "games/floodgate-07/src/features/health.generated.ts",
    "export const generated = true;\n",
  );
  await createFile(
    root,
    "games/floodgate-07/src/features/runtime.d.ts",
    "export declare const runtime: boolean;\n",
  );
  await createFile(root, "outside.ts", "export const outside = true;\n");
  await symlink(
    join(root, "outside.ts"),
    join(root, "games/floodgate-07/src/features/symlink.ts"),
  );

  const actionPaths = ["game.project.json", "src/features/player.ts", "acceptance.spec.ts"];
  for (const path of actionPaths) {
    if (path !== "src/features/player.ts") {
      await createFile(root, `games/floodgate-07/${path}`, "{}\n");
    }
  }
  await createFile(
    root,
    "games/floodgate-07/reuse-recipe.json",
    `${JSON.stringify(
      {
        schemaVersion: 1,
        gameId: "game.floodgate-07",
        acceptanceProfile: "topdown-vertical-slice-v1",
        cleanScaffold: "phase-0-player-and-schema",
        actions: [
          {
            id: "define-project",
            kind: "file",
            path: "games/floodgate-07/game.project.json",
          },
          {
            id: "implement-player",
            kind: "code",
            path: "games/floodgate-07/src/features/player.ts",
          },
          {
            id: "verify-game",
            kind: "test",
            path: "games/floodgate-07/acceptance.spec.ts",
          },
        ],
        verification: {
          argv: ["pnpm", "e2e", "--grep", "@vertical-slice"],
          expectedExitCode: 0,
        },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

describe("재사용 비용 측정", () => {
  test("주석·빈 행·테스트·generated·심볼릭 링크를 제외하고 POSIX 순서로 센다", async () => {
    const root = await createFixtureRepository();
    const first = await measureGameplayLoc(root, "games/floodgate-07/src/features");

    expect(first.commonGameplayLoc).toBe(7);
    expect(first.files.map((file) => file.path)).toEqual([
      "games/floodgate-07/src/features/ai/chase.ts",
      "games/floodgate-07/src/features/player.ts",
      "games/floodgate-07/src/features/z-health.ts",
    ]);
    expect(first.files.map((file) => file.loc)).toEqual([1, 4, 2]);

    await createFile(
      root,
      "games/floodgate-07/src/features/player.ts",
      [
        "// 주석 전용 행",
        "const speed = 10; // inline comment",
        "",
        "export function move(distance: number) {",
        "  /* block comment */",
        "  return speed * distance;",
        "}",
        "",
      ].join("\n"),
    );
    const second = await measureGameplayLoc(root, "games/floodgate-07/src/features");
    expect(second.sourceDigest).toBe(first.sourceDigest);
  });

  test("recipe action을 엄격히 검증하고 action 수를 수동 설정 단계로 고정한다", async () => {
    const root = await createFixtureRepository();
    const measurement = await measureReuse({ repoRoot: root });

    expect(measurement.manualSetupSteps).toBe(3);
    expect(measurement.breakdown.actionIds).toEqual([
      "define-project",
      "implement-player",
      "verify-game",
    ]);
    expect(measurement.inputs.recipeDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(measurement.inputs.sourceDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test("중복 ID와 저장소 밖 action 경로를 거부한다", () => {
    const base = {
      schemaVersion: 1,
      gameId: "game.floodgate-07",
      acceptanceProfile: "topdown-vertical-slice-v1",
      cleanScaffold: "clean",
      verification: { argv: ["pnpm", "e2e"], expectedExitCode: 0 },
    };

    expect(() =>
      parseReuseRecipe({
        ...base,
        actions: [
          { id: "same", kind: "file", path: "games/a.json" },
          { id: "same", kind: "code", path: "games/a.ts" },
        ],
      }),
    ).toThrow(/중복된 action ID/);
    expect(() =>
      parseReuseRecipe({
        ...base,
        actions: [{ id: "escape", kind: "file", path: "../outside.json" }],
      }),
    ).toThrow(/상위 경로/);
  });

  test("명시적으로 쓴 baseline은 통과하고 입력 drift는 실패한다", async () => {
    const root = await createFixtureRepository();
    const baselinePath = join(root, "tests/benchmarks/reuse-baseline.json");
    const measurement = await measureReuse({ repoRoot: root });
    await writeBaseline(baselinePath, measurement);
    await expect(checkBaseline(baselinePath, measurement)).resolves.toBeUndefined();

    const baselineText = await readFile(baselinePath, "utf8");
    expect(baselineText).not.toMatch(/capturedAt|timestamp/);

    await createFile(
      root,
      "games/floodgate-07/src/features/new-feature.ts",
      "export const newFeature = true;\n",
    );
    const driftedMeasurement = await measureReuse({ repoRoot: root });
    await expect(checkBaseline(baselinePath, driftedMeasurement)).rejects.toThrow(/drift/);
  });

  test("기본 모드는 check이고 baseline 갱신은 명시적 flag만 허용한다", () => {
    expect(parseCliOptions([]).mode).toBe("check");
    expect(parseCliOptions(["--check"]).mode).toBe("check");
    expect(parseCliOptions(["--write-baseline"]).mode).toBe("write");
    expect(parseCliOptions(["--", "--check"]).mode).toBe("check");
    expect(parseCliOptions(["--", "--write-baseline"]).mode).toBe("write");
    expect(() => parseCliOptions(["--check", "--write-baseline"])).toThrow(/함께 사용할 수/);
  });
});
