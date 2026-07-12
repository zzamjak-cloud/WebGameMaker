import { describe, expect, it } from "vitest";

import {
  applyRelayContact,
  compileProject,
  createRelayState,
  moveRelayPlayer,
  stepRelayEnemies,
  syncRelayNode,
} from "../src/index.js";
import { relayWardBundle } from "./fixture.js";

function state() {
  return createRelayState(compileProject(relayWardBundle).rules);
}

describe("relay-ward gameplay rules", () => {
  it("공용 이동 계산으로 플레이어를 이동시키고 경계 안에 둔다", () => {
    const config = compileProject(relayWardBundle).rules;
    const moved = moveRelayPlayer(
      createRelayState(config),
      { up: true, down: false, left: false, right: true },
      1_000,
      config.bounds,
    );

    expect(moved.player.facing).toBe("right");
    expect(moved.player.position.x).toBeGreaterThan(config.player.position.x);
    expect(moved.player.position.y).toBeLessThan(config.player.position.y);
  });

  it("공용 적 AI로 감지 거리 안의 적을 추적으로 전환한다", () => {
    const close = state();
    const advanced = stepRelayEnemies(
      {
        ...close,
        player: {
          ...close.player,
          position: { x: 430, y: 450 },
        },
      },
      500,
    );

    expect(advanced.enemies.some((enemy) => enemy.mode === "chase")).toBe(true);
  });

  it("공용 접촉 피해로 체력과 패배 상태를 갱신한다", () => {
    const first = applyRelayContact(state(), "entity.warden-01", 100);
    const ignored = applyRelayContact(first, "entity.warden-01", 200);

    expect(first.player.health).toBe(64);
    expect(ignored.player.health).toBe(64);
  });

  it("relay node를 순서대로 동기화하면 승리한다", () => {
    const wrong = syncRelayNode(state(), "entity.relay-node-02");
    const first = syncRelayNode(wrong, "entity.relay-node-01");
    const second = syncRelayNode(first, "entity.relay-node-02");
    const third = syncRelayNode(second, "entity.relay-node-03");

    expect(wrong.nextOrder).toBe(1);
    expect(third.phase).toBe("won");
    expect(third.nodes.every((node) => node.synced)).toBe(true);
  });
});
