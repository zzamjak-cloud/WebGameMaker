import { describe, expect, it } from "vitest";

import { compileProject } from "../src/compileProject.js";
import { createBundle } from "./fixture.js";

interface MutableModule {
  moduleId: string;
  enabled: boolean;
  targetEntityId?: string;
  config: Record<string, unknown>;
}

interface MutableEntity {
  id: string;
  modules: MutableModule[];
}

interface MutableScene {
  entities: MutableEntity[];
}

interface MutableBundle {
  scenes: MutableScene[];
}

function mutableBundle(): MutableBundle {
  return createBundle() as MutableBundle;
}

function findEntity(bundle: MutableBundle, id: string): MutableEntity {
  const entity = bundle.scenes[0]?.entities.find(
    (candidate) => candidate.id === id,
  );
  if (!entity) {
    throw new Error(`테스트 엔티티를 찾을 수 없습니다: ${id}`);
  }
  return entity;
}

function findModule(entity: MutableEntity, moduleId: string): MutableModule {
  const module = entity.modules.find(
    (candidate) => candidate.moduleId === moduleId,
  );
  if (!module) {
    throw new Error(`테스트 모듈을 찾을 수 없습니다: ${moduleId}`);
  }
  return module;
}

describe("compileProject", () => {
  it("schema v1 bundle의 게임 전용 설정을 컴파일한다", () => {
    const config = compileProject(createBundle());

    expect(config.projectId).toBe("game.floodgate-07");
    expect(config.sceneId).toBe("scene.floodgate-07-main");
    expect(config.viewport).toEqual({ width: 1280, height: 720 });
    expect(config.player.id).toBe("entity.maintenance-drone");
    expect(config.player.searchlight.heatPerPulse).toBe(38);
    expect(config.enemies).toHaveLength(3);
    expect(config.enemies.map((enemy) => enemy.id)).toEqual([
      "entity.ink-creature-01",
      "entity.ink-creature-02",
      "entity.ink-creature-03",
    ]);
    expect(config.beacons.map((beacon) => beacon.order)).toEqual([1, 2, 3]);
  });

  it("게임 adapter 전에 기존 schema validator를 통과한다", () => {
    const bundle = mutableBundle() as MutableBundle & {
      project?: { schemaVersion?: number };
    };
    if (!bundle.project) {
      throw new Error("테스트 프로젝트를 찾을 수 없습니다.");
    }
    bundle.project.schemaVersion = 2;

    expect(() => compileProject(bundle)).toThrow();
  });

  it("필수 모듈이 비활성화되면 구체적인 오류를 낸다", () => {
    const bundle = mutableBundle();
    const player = findEntity(bundle, "entity.maintenance-drone");
    findModule(player, "module.searchlight-pulse").enabled = false;

    expect(() => compileProject(bundle)).toThrow(
      "module.searchlight-pulse 활성 바인딩이 정확히 하나 필요합니다.",
    );
  });

  it("module config의 잘못된 타입을 거부한다", () => {
    const bundle = mutableBundle();
    const player = findEntity(bundle, "entity.maintenance-drone");
    findModule(player, "module.player-move-2d").config.speed = "빠름";

    expect(() => compileProject(bundle)).toThrow(
      "module.player-move-2d.speed: 유한한 숫자여야 합니다.",
    );
  });

  it("추적 이탈 거리가 감지 거리보다 작으면 거부한다", () => {
    const bundle = mutableBundle();
    const enemy = findEntity(bundle, "entity.ink-creature-01");
    findModule(enemy, "module.enemy-chase").config.disengageDistance = 200;

    expect(() => compileProject(bundle)).toThrow(
      "module.enemy-chase.disengageDistance: 감지 거리보다 커야 합니다.",
    );
  });

  it("신호등 순서 중복을 거부한다", () => {
    const bundle = mutableBundle();
    const beacon = findEntity(bundle, "entity.signal-beacon-02");
    findModule(beacon, "module.signal-beacon").config.order = 1;

    expect(() => compileProject(bundle)).toThrow(
      "신호등 순서는 1, 2, 3이어야 합니다.",
    );
  });
});
