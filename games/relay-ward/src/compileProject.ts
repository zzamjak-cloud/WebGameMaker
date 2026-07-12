import type {
  EnemyAiConfig,
  Facing,
  Position,
} from "@web-game-maker/core-modules";
import {
  parseProjectBundle,
  type Entity,
  type ModuleBinding,
} from "@web-game-maker/schema";

import type { RelayEnemy, RelayRulesConfig } from "./gameplay/relayRules.js";

export interface RelayProjectConfig {
  projectId: string;
  projectName: string;
  sceneId: string;
  rules: RelayRulesConfig;
}

type JsonRecord = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new Error(`[relay-ward] ${path}: ${message}`);
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "객체여야 합니다.");
  }
  return value as JsonRecord;
}

function number(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(path, "유한한 숫자여야 합니다.");
  }
  return value;
}

function module(entity: Entity, moduleId: string): ModuleBinding {
  const found = entity.modules.filter(
    (candidate) => candidate.enabled && candidate.moduleId === moduleId,
  );
  if (found.length !== 1) {
    return fail(entity.id, `${moduleId} 활성 바인딩이 정확히 하나 필요합니다.`);
  }
  return found[0]!;
}

function position(entity: Entity): Position {
  return {
    x: entity.transform.position.x,
    y: entity.transform.position.y,
  };
}

function cfg(binding: ModuleBinding): JsonRecord {
  return record(binding.config, binding.id);
}

function readHealth(entity: Entity): { health: number; maximumHealth: number } {
  const health = cfg(module(entity, "module.health"));
  const maximumHealth = number(health.maximum, `${entity.id}.health.maximum`);
  return {
    maximumHealth,
    health: number(health.current, `${entity.id}.health.current`),
  };
}

function readPlayer(entity: Entity): RelayRulesConfig["player"] {
  const move = cfg(module(entity, "module.player-move-2d"));
  const health = readHealth(entity);
  return {
    position: position(entity),
    facing: "up" satisfies Facing,
    speed: number(move.speed, `${entity.id}.move.speed`),
    health: health.health,
    maximumHealth: health.maximumHealth,
  };
}

function readEnemy(entity: Entity, playerId: string, index: number): RelayEnemy {
  const patrol = cfg(module(entity, "module.enemy-patrol"));
  const chase = module(entity, "module.enemy-chase");
  const contact = module(entity, "module.damage-contact");
  if (chase.targetEntityId !== playerId || contact.targetEntityId !== playerId) {
    return fail(entity.id, `적 모듈은 ${playerId}를 targetEntityId로 참조해야 합니다.`);
  }
  const chaseConfig = cfg(chase);
  const ai: EnemyAiConfig = {
    patrol: {
      axis: patrol.axis === "y" ? "y" : "x",
      distance: number(patrol.distance, `${entity.id}.patrol.distance`),
      speed: number(patrol.speed, `${entity.id}.patrol.speed`),
    },
    chase: {
      detectionDistance: number(chaseConfig.detectionDistance, `${entity.id}.chase.detectionDistance`),
      disengageDistance: number(chaseConfig.disengageDistance, `${entity.id}.chase.disengageDistance`),
      speed: number(chaseConfig.speed, `${entity.id}.chase.speed`),
      stopDistance: number(chaseConfig.stopDistance, `${entity.id}.chase.stopDistance`),
    },
  };
  const contactConfig = cfg(contact);
  return {
    id: entity.id,
    mode: "patrol",
    position: position(entity),
    patrolOrigin: position(entity),
    patrolDirection: index % 2 === 0 ? 1 : -1,
    ai,
    contact: {
      damage: number(contactConfig.damage, `${entity.id}.contact.damage`),
      cooldownMs: number(contactConfig.cooldownMs, `${entity.id}.contact.cooldownMs`),
    },
  };
}

function readRelayNode(entity: Entity): { id: string; order: number } {
  const node = cfg(module(entity, "module.relay-node"));
  return {
    id: entity.id,
    order: number(node.order, `${entity.id}.relay.order`),
  };
}

export function compileProject(input: unknown): RelayProjectConfig {
  const bundle = parseProjectBundle(input);
  const scene = bundle.scenes.find(
    (candidate) => candidate.id === bundle.project.entrySceneId,
  );
  if (!scene || scene.type !== "world") {
    return fail("project.entrySceneId", "world 진입 장면을 찾을 수 없습니다.");
  }
  const playerEntity = scene.entities.find((entity) =>
    entity.modules.some(
      (binding) => binding.enabled && binding.moduleId === "module.player-move-2d",
    ),
  );
  if (!playerEntity) {
    return fail(scene.id, "플레이어 엔티티가 필요합니다.");
  }
  const enemies = scene.entities
    .filter((entity) =>
      entity.modules.some(
        (binding) => binding.enabled && binding.moduleId === "module.enemy-patrol",
      ),
    )
    .map((entity, index) => readEnemy(entity, playerEntity.id, index));
  const nodes = scene.entities
    .filter((entity) =>
      entity.modules.some(
        (binding) => binding.enabled && binding.moduleId === "module.relay-node",
      ),
    )
    .map(readRelayNode);
  return {
    projectId: bundle.project.id,
    projectName: bundle.project.name,
    sceneId: scene.id,
    rules: {
      bounds: { ...bundle.project.viewport, padding: 36 },
      player: readPlayer(playerEntity),
      enemies,
      nodes,
    },
  };
}
