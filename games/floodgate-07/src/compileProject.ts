export interface Position {
  x: number;
  y: number;
}

export interface ViewportConfig {
  width: number;
  height: number;
}

export interface HealthConfig {
  maximum: number;
  current: number;
}

export interface SearchlightConfig {
  damage: number;
  range: number;
  halfAngleDegrees: number;
  heatPerPulse: number;
  coolingPerSecond: number;
  overheatLockMs: number;
  recoveryHeat: number;
}

export interface PlayerConfig {
  id: string;
  name: string;
  spawn: Position;
  speed: number;
  health: HealthConfig;
  searchlight: SearchlightConfig;
}

export interface EnemyConfig {
  id: string;
  name: string;
  spawn: Position;
  health: HealthConfig;
  patrol: {
    axis: "x" | "y";
    distance: number;
    speed: number;
  };
  chase: {
    speed: number;
    detectionDistance: number;
    disengageDistance: number;
    stopDistance: number;
  };
  contact: {
    damage: number;
    cooldownMs: number;
  };
}

export interface BeaconConfig {
  id: string;
  name: string;
  position: Position;
  order: number;
}

export interface FloodgateProjectConfig {
  projectId: string;
  projectName: string;
  sceneId: string;
  viewport: ViewportConfig;
  player: PlayerConfig;
  enemies: readonly EnemyConfig[];
  beacons: readonly BeaconConfig[];
}

type JsonRecord = Record<string, unknown>;

interface ModuleInput {
  moduleId: string;
  enabled: boolean;
  targetEntityId?: string;
  config: JsonRecord;
}

interface EntityInput {
  id: string;
  name: string;
  position: Position;
  modules: ModuleInput[];
}

function fail(path: string, message: string): never {
  throw new Error(`[floodgate-07] ${path}: ${message}`);
}

function expectRecord(value: unknown, path: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "객체여야 합니다.");
  }
  return value as JsonRecord;
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    return fail(path, "배열이어야 합니다.");
  }
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    return fail(path, "비어 있지 않은 문자열이어야 합니다.");
  }
  return value;
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    return fail(path, "boolean이어야 합니다.");
  }
  return value;
}

interface NumberRange {
  minimum?: number;
  maximum?: number;
  integer?: boolean;
}

function expectNumber(
  value: unknown,
  path: string,
  range: NumberRange = {},
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(path, "유한한 숫자여야 합니다.");
  }
  if (range.integer === true && !Number.isInteger(value)) {
    return fail(path, "정수여야 합니다.");
  }
  if (range.minimum !== undefined && value < range.minimum) {
    return fail(path, `${range.minimum} 이상이어야 합니다.`);
  }
  if (range.maximum !== undefined && value > range.maximum) {
    return fail(path, `${range.maximum} 이하여야 합니다.`);
  }
  return value;
}

function expectAxis(value: unknown, path: string): "x" | "y" {
  if (value !== "x" && value !== "y") {
    return fail(path, '"x" 또는 "y"여야 합니다.');
  }
  return value;
}

function readPosition(value: unknown, path: string): Position {
  const transform = expectRecord(value, path);
  const position = expectRecord(transform.position, `${path}.position`);
  return {
    x: expectNumber(position.x, `${path}.position.x`),
    y: expectNumber(position.y, `${path}.position.y`),
  };
}

function readModule(value: unknown, path: string): ModuleInput {
  const module = expectRecord(value, path);
  const targetEntityId = module.targetEntityId;
  if (targetEntityId !== undefined && typeof targetEntityId !== "string") {
    return fail(`${path}.targetEntityId`, "문자열이어야 합니다.");
  }

  return {
    moduleId: expectString(module.moduleId, `${path}.moduleId`),
    enabled: expectBoolean(module.enabled, `${path}.enabled`),
    ...(targetEntityId === undefined ? {} : { targetEntityId }),
    config: expectRecord(module.config, `${path}.config`),
  };
}

function readEntity(value: unknown, path: string): EntityInput {
  const entity = expectRecord(value, path);
  return {
    id: expectString(entity.id, `${path}.id`),
    name: expectString(entity.name, `${path}.name`),
    position: readPosition(entity.transform, `${path}.transform`),
    modules: expectArray(entity.modules, `${path}.modules`).map((module, index) =>
      readModule(module, `${path}.modules[${index}]`),
    ),
  };
}

function hasEnabledModule(entity: EntityInput, moduleId: string): boolean {
  return entity.modules.some(
    (module) => module.enabled && module.moduleId === moduleId,
  );
}

function requireModule(entity: EntityInput, moduleId: string): ModuleInput {
  const matches = entity.modules.filter(
    (module) => module.enabled && module.moduleId === moduleId,
  );
  if (matches.length !== 1) {
    return fail(
      `entity(${entity.id}).modules`,
      `${moduleId} 활성 바인딩이 정확히 하나 필요합니다.`,
    );
  }
  return matches[0]!;
}

function readHealth(entity: EntityInput): HealthConfig {
  const config = requireModule(entity, "module.health").config;
  const maximum = expectNumber(
    config.maximum,
    `entity(${entity.id}).module.health.maximum`,
    { minimum: 1, maximum: 100_000 },
  );
  const current = expectNumber(
    config.current,
    `entity(${entity.id}).module.health.current`,
    { minimum: 0, maximum },
  );
  return { maximum, current };
}

function readPlayer(entity: EntityInput): PlayerConfig {
  const movement = requireModule(entity, "module.player-move-2d").config;
  const searchlight = requireModule(entity, "module.searchlight-pulse").config;

  return {
    id: entity.id,
    name: entity.name,
    spawn: { ...entity.position },
    speed: expectNumber(
      movement.speed,
      `entity(${entity.id}).module.player-move-2d.speed`,
      { minimum: 1, maximum: 2_000 },
    ),
    health: readHealth(entity),
    searchlight: {
      damage: expectNumber(
        searchlight.damage,
        `entity(${entity.id}).module.searchlight-pulse.damage`,
        { minimum: 1, maximum: 100_000 },
      ),
      range: expectNumber(
        searchlight.range,
        `entity(${entity.id}).module.searchlight-pulse.range`,
        { minimum: 1, maximum: 5_000 },
      ),
      halfAngleDegrees: expectNumber(
        searchlight.halfAngleDegrees,
        `entity(${entity.id}).module.searchlight-pulse.halfAngleDegrees`,
        { minimum: 1, maximum: 90 },
      ),
      heatPerPulse: expectNumber(
        searchlight.heatPerPulse,
        `entity(${entity.id}).module.searchlight-pulse.heatPerPulse`,
        { minimum: 0.01, maximum: 100 },
      ),
      coolingPerSecond: expectNumber(
        searchlight.coolingPerSecond,
        `entity(${entity.id}).module.searchlight-pulse.coolingPerSecond`,
        { minimum: 0.01, maximum: 1_000 },
      ),
      overheatLockMs: expectNumber(
        searchlight.overheatLockMs,
        `entity(${entity.id}).module.searchlight-pulse.overheatLockMs`,
        { minimum: 0, maximum: 60_000 },
      ),
      recoveryHeat: expectNumber(
        searchlight.recoveryHeat,
        `entity(${entity.id}).module.searchlight-pulse.recoveryHeat`,
        { minimum: 0, maximum: 99.99 },
      ),
    },
  };
}

function readEnemy(entity: EntityInput, playerId: string): EnemyConfig {
  const patrol = requireModule(entity, "module.enemy-patrol").config;
  const chaseModule = requireModule(entity, "module.enemy-chase");
  const contactModule = requireModule(entity, "module.damage-contact");

  if (chaseModule.targetEntityId !== playerId) {
    return fail(
      `entity(${entity.id}).module.enemy-chase.targetEntityId`,
      `플레이어 ${playerId}를 참조해야 합니다.`,
    );
  }
  if (contactModule.targetEntityId !== playerId) {
    return fail(
      `entity(${entity.id}).module.damage-contact.targetEntityId`,
      `플레이어 ${playerId}를 참조해야 합니다.`,
    );
  }

  const chase = chaseModule.config;
  const detectionDistance = expectNumber(
    chase.detectionDistance,
    `entity(${entity.id}).module.enemy-chase.detectionDistance`,
    { minimum: 1, maximum: 5_000 },
  );
  const disengageDistance = expectNumber(
    chase.disengageDistance,
    `entity(${entity.id}).module.enemy-chase.disengageDistance`,
    { minimum: 1, maximum: 5_000 },
  );
  if (disengageDistance <= detectionDistance) {
    return fail(
      `entity(${entity.id}).module.enemy-chase.disengageDistance`,
      "감지 거리보다 커야 합니다.",
    );
  }
  const stopDistance = expectNumber(
    chase.stopDistance,
    `entity(${entity.id}).module.enemy-chase.stopDistance`,
    { minimum: 0, maximum: detectionDistance },
  );
  if (stopDistance >= detectionDistance) {
    return fail(
      `entity(${entity.id}).module.enemy-chase.stopDistance`,
      "감지 거리보다 작아야 합니다.",
    );
  }

  return {
    id: entity.id,
    name: entity.name,
    spawn: { ...entity.position },
    health: readHealth(entity),
    patrol: {
      axis: expectAxis(
        patrol.axis,
        `entity(${entity.id}).module.enemy-patrol.axis`,
      ),
      distance: expectNumber(
        patrol.distance,
        `entity(${entity.id}).module.enemy-patrol.distance`,
        { minimum: 1, maximum: 5_000 },
      ),
      speed: expectNumber(
        patrol.speed,
        `entity(${entity.id}).module.enemy-patrol.speed`,
        { minimum: 1, maximum: 2_000 },
      ),
    },
    chase: {
      speed: expectNumber(
        chase.speed,
        `entity(${entity.id}).module.enemy-chase.speed`,
        { minimum: 1, maximum: 2_000 },
      ),
      detectionDistance,
      disengageDistance,
      stopDistance,
    },
    contact: {
      damage: expectNumber(
        contactModule.config.damage,
        `entity(${entity.id}).module.damage-contact.damage`,
        { minimum: 1, maximum: 100_000 },
      ),
      cooldownMs: expectNumber(
        contactModule.config.cooldownMs,
        `entity(${entity.id}).module.damage-contact.cooldownMs`,
        { minimum: 0, maximum: 60_000 },
      ),
    },
  };
}

function readBeacon(entity: EntityInput): BeaconConfig {
  const config = requireModule(entity, "module.signal-beacon").config;
  return {
    id: entity.id,
    name: entity.name,
    position: { ...entity.position },
    order: expectNumber(
      config.order,
      `entity(${entity.id}).module.signal-beacon.order`,
      { minimum: 1, maximum: 3, integer: true },
    ),
  };
}

export function compileProject(input: unknown): FloodgateProjectConfig {
  const bundle = expectRecord(parseProjectBundle(input), "bundle");
  const project = expectRecord(bundle.project, "bundle.project");
  const projectId = expectString(project.id, "bundle.project.id");
  const projectName = expectString(project.name, "bundle.project.name");
  const entrySceneId = expectString(
    project.entrySceneId,
    "bundle.project.entrySceneId",
  );
  const viewportInput = expectRecord(project.viewport, "bundle.project.viewport");
  const viewport = {
    width: expectNumber(viewportInput.width, "bundle.project.viewport.width", {
      minimum: 1,
      maximum: 16_384,
      integer: true,
    }),
    height: expectNumber(viewportInput.height, "bundle.project.viewport.height", {
      minimum: 1,
      maximum: 16_384,
      integer: true,
    }),
  };

  const sceneInputs = expectArray(bundle.scenes, "bundle.scenes").map(
    (sceneValue, index) => {
      const scene = expectRecord(sceneValue, `bundle.scenes[${index}]`);
      return {
        id: expectString(scene.id, `bundle.scenes[${index}].id`),
        type: expectString(scene.type, `bundle.scenes[${index}].type`),
        entities: expectArray(
          scene.entities,
          `bundle.scenes[${index}].entities`,
        ).map((entity, entityIndex) =>
          readEntity(entity, `bundle.scenes[${index}].entities[${entityIndex}]`),
        ),
      };
    },
  );
  const scene = sceneInputs.find((candidate) => candidate.id === entrySceneId);
  if (!scene) {
    return fail("bundle.project.entrySceneId", "진입 장면을 찾을 수 없습니다.");
  }
  if (scene.type !== "world") {
    return fail(`scene(${scene.id}).type`, '"world"여야 합니다.');
  }

  const playerEntities = scene.entities.filter((entity) =>
    hasEnabledModule(entity, "module.player-move-2d"),
  );
  if (playerEntities.length !== 1) {
    return fail(
      `scene(${scene.id}).entities`,
      "활성 player-move-2d 엔티티가 정확히 하나 필요합니다.",
    );
  }
  const player = readPlayer(playerEntities[0]!);

  const enemyEntities = scene.entities.filter((entity) =>
    hasEnabledModule(entity, "module.enemy-patrol"),
  );
  if (enemyEntities.length !== 3) {
    return fail(
      `scene(${scene.id}).entities`,
      "순찰 적이 정확히 세 개 필요합니다.",
    );
  }
  const enemies = enemyEntities
    .map((entity) => readEnemy(entity, player.id))
    .sort((left, right) => left.id.localeCompare(right.id));

  const beaconEntities = scene.entities.filter((entity) =>
    hasEnabledModule(entity, "module.signal-beacon"),
  );
  if (beaconEntities.length !== 3) {
    return fail(
      `scene(${scene.id}).entities`,
      "신호등이 정확히 세 개 필요합니다.",
    );
  }
  const beacons = beaconEntities
    .map(readBeacon)
    .sort((left, right) => left.order - right.order);
  beacons.forEach((beacon, index) => {
    if (beacon.order !== index + 1) {
      fail(
        `entity(${beacon.id}).module.signal-beacon.order`,
        "신호등 순서는 1, 2, 3이어야 합니다.",
      );
    }
  });

  return {
    projectId,
    projectName,
    sceneId: scene.id,
    viewport,
    player,
    enemies,
    beacons,
  };
}
import { parseProjectBundle } from "@web-game-maker/schema";
