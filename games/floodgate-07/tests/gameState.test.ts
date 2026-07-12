import { describe, expect, it } from "vitest";

import {
  advanceElapsedMs,
  createInitialGameState,
  replaceEnemyState,
  restartGameState,
  updatePlayerPose,
} from "../src/gameState.js";
import { getCompiledProject } from "./fixture.js";

describe("gameState", () => {
  it("세 적과 세 신호등을 가진 초기 상태를 만든다", () => {
    const config = getCompiledProject();
    const state = createInitialGameState(config);

    expect(state.phase).toBe("playing");
    expect(state.player).toMatchObject({
      health: 100,
      maxHealth: 100,
      facing: "up",
      invulnerableUntil: 0,
    });
    expect(state.lamp).toEqual({
      heat: 0,
      overheated: false,
      overheatedUntil: 0,
    });
    expect(state.enemies).toHaveLength(3);
    expect(state.enemies.every((enemy) => enemy.mode === "patrol")).toBe(true);
    expect(state.objective).toEqual({ litBeacons: 0, totalBeacons: 3 });
    expect(state.run).toEqual({ runId: 1, elapsedMs: 0 });
  });

  it("playing 상태에서만 시간을 전진시킨다", () => {
    const state = createInitialGameState(getCompiledProject());
    const advanced = advanceElapsedMs(state, 250);
    const stopped = advanceElapsedMs({ ...advanced, phase: "won" }, 250);

    expect(advanced.run.elapsedMs).toBe(250);
    expect(stopped.run.elapsedMs).toBe(250);
  });

  it("재시작하면 runId만 증가하고 모든 플레이 상태를 초기화한다", () => {
    const config = getCompiledProject();
    const initial = createInitialGameState(config, 4);
    const moved = updatePlayerPose(initial, { x: 20, y: 30 }, "left");
    const changedEnemy = {
      ...moved.enemies[0]!,
      health: 0,
      mode: "dead" as const,
    };
    const changed = replaceEnemyState(moved, changedEnemy);
    const restarted = restartGameState(config, {
      ...changed,
      phase: "won",
      lamp: { heat: 100, overheated: true, overheatedUntil: 900 },
      objective: { litBeacons: 3, totalBeacons: 3 },
      run: { runId: 4, elapsedMs: 2_000 },
    });

    expect(restarted).toEqual(createInitialGameState(config, 5));
  });

  it("존재하지 않는 적 교체를 거부한다", () => {
    const state = createInitialGameState(getCompiledProject());
    expect(() =>
      replaceEnemyState(state, { ...state.enemies[0]!, id: "entity.unknown" }),
    ).toThrow("적 상태를 찾을 수 없습니다: entity.unknown");
  });
});
