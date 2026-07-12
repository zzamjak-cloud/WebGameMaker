import { describe, expect, it } from "vitest";

import { createInitialGameState } from "../src/gameState.js";
import {
  applyContactDamage,
  applySearchlightPulse,
  coolSearchlight,
  findSearchlightTargets,
} from "../src/features/combat.js";
import { getCompiledProject } from "./fixture.js";

describe("combat", () => {
  it("접촉 피해를 clamp하고 무적 시간 동안 중복 피해를 막는다", () => {
    const state = createInitialGameState(getCompiledProject());
    const first = applyContactDamage(state, {
      damage: 20,
      nowMs: 100,
      invulnerabilityMs: 700,
    });
    const blocked = applyContactDamage(first, {
      damage: 20,
      nowMs: 799,
      invulnerabilityMs: 700,
    });
    const lethal = applyContactDamage(first, {
      damage: 1_000,
      nowMs: 800,
      invulnerabilityMs: 700,
    });

    expect(first.player.health).toBe(80);
    expect(first.player.invulnerableUntil).toBe(800);
    expect(blocked).toBe(first);
    expect(lethal.player.health).toBe(0);
    expect(lethal.phase).toBe("lost");
  });

  it("플레이어 정면 부채꼴 안의 살아 있는 적만 찾는다", () => {
    const config = getCompiledProject();
    const initial = createInitialGameState(config);
    const state = {
      ...initial,
      player: {
        ...initial.player,
        position: { x: 100, y: 100 },
        facing: "right" as const,
      },
      enemies: [
        { ...initial.enemies[0]!, position: { x: 180, y: 100 } },
        { ...initial.enemies[1]!, position: { x: 20, y: 100 } },
        { ...initial.enemies[2]!, position: { x: 400, y: 100 } },
      ],
    };

    expect(findSearchlightTargets(state, config.player.searchlight)).toEqual([
      initial.enemies[0]!.id,
    ]);
  });

  it("적 제거마다 신호등을 켜고 세 적 제거 시 승리한다", () => {
    const config = getCompiledProject();
    const initial = createInitialGameState(config);
    const first = applySearchlightPulse(
      initial,
      [initial.enemies[0]!.id],
      config.player.searchlight,
      0,
    );
    const second = applySearchlightPulse(
      first,
      [initial.enemies[1]!.id],
      config.player.searchlight,
      100,
    );
    const won = applySearchlightPulse(
      second,
      [initial.enemies[2]!.id],
      config.player.searchlight,
      200,
    );

    expect(first.objective.litBeacons).toBe(1);
    expect(second.objective.litBeacons).toBe(2);
    expect(won.objective.litBeacons).toBe(3);
    expect(won.enemies.every((enemy) => enemy.mode === "dead")).toBe(true);
    expect(won.phase).toBe("won");
  });

  it("100 열에서 과열되고 잠금과 recoveryHeat 조건을 모두 만족하면 회복한다", () => {
    const config = getCompiledProject();
    const initial = createInitialGameState(config);
    const warm = applySearchlightPulse(
      applySearchlightPulse(
        applySearchlightPulse(initial, [], config.player.searchlight, 0),
        [],
        config.player.searchlight,
        100,
      ),
      [],
      config.player.searchlight,
      200,
    );
    const blocked = applySearchlightPulse(
      warm,
      [initial.enemies[0]!.id],
      config.player.searchlight,
      300,
    );
    const stillHot = coolSearchlight(
      warm,
      config.player.searchlight,
      1_000,
      1_200,
    );
    const recovered = coolSearchlight(
      stillHot,
      config.player.searchlight,
      2_000,
      3_200,
    );

    expect(warm.lamp).toEqual({
      heat: 100,
      overheated: true,
      overheatedUntil: 1_000,
    });
    expect(blocked).toBe(warm);
    expect(stillHot.lamp.overheated).toBe(true);
    expect(recovered.lamp).toEqual({
      heat: 10,
      overheated: false,
      overheatedUntil: 0,
    });
  });
});
