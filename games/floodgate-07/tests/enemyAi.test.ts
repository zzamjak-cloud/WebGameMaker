import { describe, expect, it } from "vitest";

import { createInitialGameState } from "../src/gameState.js";
import {
  distanceBetween,
  resolveEnemyMode,
  stepEnemyAi,
} from "../src/features/enemyAi.js";
import { getCompiledProject } from "./fixture.js";

describe("enemyAi", () => {
  it("감지 거리와 이탈 거리 사이에서 상태 떨림을 막는다", () => {
    const config = getCompiledProject().enemies[0]!;
    const enemyPosition = { x: 0, y: 0 };
    const playerPosition = {
      x: config.chase.detectionDistance + 10,
      y: 0,
    };

    expect(
      resolveEnemyMode("patrol", enemyPosition, playerPosition, config.chase),
    ).toBe("patrol");
    expect(
      resolveEnemyMode("chase", enemyPosition, playerPosition, config.chase),
    ).toBe("chase");
  });

  it("patrol에서 chase로 전환해 플레이어 쪽으로 이동한다", () => {
    const project = getCompiledProject();
    const enemyConfig = project.enemies[0]!;
    const enemy = createInitialGameState(project).enemies[0]!;
    const playerPosition = {
      x: enemy.position.x + 100,
      y: enemy.position.y,
    };
    const before = distanceBetween(enemy.position, playerPosition);
    const after = stepEnemyAi(enemy, playerPosition, enemyConfig, 500);

    expect(after.mode).toBe("chase");
    expect(distanceBetween(after.position, playerPosition)).toBeLessThan(before);
  });

  it("추적 이탈 후 patrol 경로로 복귀한다", () => {
    const project = getCompiledProject();
    const enemyConfig = project.enemies[0]!;
    const initial = createInitialGameState(project).enemies[0]!;
    const enemy = {
      ...initial,
      mode: "chase" as const,
      position: {
        x: initial.patrolOrigin.x + 160,
        y: initial.patrolOrigin.y + 120,
      },
    };
    const playerPosition = {
      x: enemy.position.x + enemyConfig.chase.disengageDistance + 100,
      y: enemy.position.y,
    };
    const after = stepEnemyAi(enemy, playerPosition, enemyConfig, 500);

    expect(after.mode).toBe("patrol");
    expect(Math.abs(after.position.y - enemy.patrolOrigin.y)).toBeLessThan(
      Math.abs(enemy.position.y - enemy.patrolOrigin.y),
    );
  });

  it("같은 입력은 seed 없이 같은 결과를 만든다", () => {
    const project = getCompiledProject();
    const enemyConfig = project.enemies[1]!;
    const enemy = createInitialGameState(project).enemies[1]!;
    const player = { x: 10, y: 10 };

    expect(stepEnemyAi(enemy, player, enemyConfig, 16)).toEqual(
      stepEnemyAi(enemy, player, enemyConfig, 16),
    );
  });

  it("dead 상태는 움직이지 않는다", () => {
    const project = getCompiledProject();
    const enemyConfig = project.enemies[2]!;
    const enemy = {
      ...createInitialGameState(project).enemies[2]!,
      health: 0,
      mode: "dead" as const,
    };

    expect(stepEnemyAi(enemy, { x: 0, y: 0 }, enemyConfig, 1_000)).toBe(
      enemy,
    );
  });
});
