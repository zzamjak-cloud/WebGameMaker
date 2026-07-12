import { describe, expect, it } from "vitest";

import { compileProject } from "../src/index.js";
import { relayWardBundle } from "./fixture.js";

type MutableBundle = typeof relayWardBundle & {
  scenes: Array<{
    entities: Array<{
      modules: Array<{ targetEntityId?: string }>;
    }>;
  }>;
};

describe("relay-ward project compiler", () => {
  it("JSON bundle을 relay 규칙 설정으로 변환한다", () => {
    const config = compileProject(relayWardBundle);

    expect(config.projectId).toBe("game.relay-ward");
    expect(config.rules.player.speed).toBe(285);
    expect(config.rules.enemies).toHaveLength(3);
    expect(config.rules.nodes.map((node) => node.order)).toEqual([1, 2, 3]);
  });

  it("적 추적과 접촉 모듈은 플레이어를 target으로 참조해야 한다", () => {
    const broken = structuredClone(relayWardBundle) as MutableBundle;
    broken.scenes[0]!.entities[1]!.modules[2]!.targetEntityId = "entity.missing";

    expect(() => compileProject(broken)).toThrow(/targetEntityId/);
  });
});
