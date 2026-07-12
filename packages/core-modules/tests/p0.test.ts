import { describe, expect, it } from "vitest";

import {
  createCoreModuleRegistry,
  resolveContactDamage,
  resolvePlayerMovement,
  stepEnemyAi,
} from "../src/index.js";

describe("core-modules P0", () => {
  it("공용 레지스트리에 floodgate가 쓰는 모듈 ID를 포함한다", () => {
    const registry = createCoreModuleRegistry();
    for (const id of [
      "module.player-move-2d",
      "module.health",
      "module.enemy-patrol",
      "module.enemy-chase",
      "module.damage-contact",
    ]) {
      expect(registry.has(id)).toBe(true);
    }
  });

  it("이동·추적·접촉 피해 순수 함수가 동작한다", () => {
    const move = resolvePlayerMovement(
      { up: true, down: false, left: false, right: false },
      100,
      "down",
    );
    expect(move.facing).toBe("up");
    expect(move.velocity.y).toBeLessThan(0);

    const chased = stepEnemyAi(
      {
        mode: "patrol",
        position: { x: 0, y: 0 },
        patrolOrigin: { x: 0, y: 0 },
        patrolDirection: 1,
      },
      { x: 10, y: 0 },
      {
        patrol: { axis: "x", distance: 40, speed: 40 },
        chase: {
          detectionDistance: 80,
          disengageDistance: 120,
          speed: 60,
          stopDistance: 8,
        },
      },
      16,
    );
    expect(chased.mode).toBe("chase");

    const hit = resolveContactDamage({
      health: 10,
      maximumHealth: 10,
      invulnerableUntil: 0,
      damage: 4,
      nowMs: 100,
      invulnerabilityMs: 500,
    });
    expect(hit?.health).toBe(6);
  });
});
