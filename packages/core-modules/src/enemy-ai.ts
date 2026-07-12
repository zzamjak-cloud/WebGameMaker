import {
  distanceBetween,
  type ChaseConfig,
  type EnemyAiConfig,
  type EnemyAiState,
  type EnemyMode,
  type Position,
} from "./shared.js";

const ROUTE_EPSILON = 0.001;

function assertDelta(deltaMs: number): void {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    throw new Error("deltaMs는 0 이상의 유한한 숫자여야 합니다.");
  }
}

export function resolveEnemyMode(
  mode: EnemyMode,
  enemyPosition: Position,
  playerPosition: Position,
  config: ChaseConfig,
): EnemyMode {
  if (mode === "dead") {
    return "dead";
  }
  const distance = distanceBetween(enemyPosition, playerPosition);
  if (mode === "patrol" && distance <= config.detectionDistance) {
    return "chase";
  }
  if (mode === "chase" && distance > config.disengageDistance) {
    return "patrol";
  }
  return mode;
}

function moveToward(
  position: Position,
  target: Position,
  maximumDistance: number,
): Position {
  const distance = distanceBetween(position, target);
  if (distance === 0 || maximumDistance >= distance) {
    return { ...target };
  }
  const ratio = maximumDistance / distance;
  return {
    x: position.x + (target.x - position.x) * ratio,
    y: position.y + (target.y - position.y) * ratio,
  };
}

function getClosestPatrolPoint(
  enemy: EnemyAiState,
  config: EnemyAiConfig["patrol"],
): Position {
  if (config.axis === "x") {
    return {
      x: Math.min(
        enemy.patrolOrigin.x + config.distance,
        Math.max(enemy.patrolOrigin.x - config.distance, enemy.position.x),
      ),
      y: enemy.patrolOrigin.y,
    };
  }
  return {
    x: enemy.patrolOrigin.x,
    y: Math.min(
      enemy.patrolOrigin.y + config.distance,
      Math.max(enemy.patrolOrigin.y - config.distance, enemy.position.y),
    ),
  };
}

function isOnPatrolRoute(position: Position, patrolPoint: Position): boolean {
  return distanceBetween(position, patrolPoint) <= ROUTE_EPSILON;
}

function advancePatrol<T extends EnemyAiState>(
  enemy: T,
  config: EnemyAiConfig["patrol"],
  distance: number,
): T {
  const minimum = enemy.patrolOrigin[config.axis] - config.distance;
  const maximum = enemy.patrolOrigin[config.axis] + config.distance;
  const routeLength = maximum - minimum;
  const period = routeLength * 2;
  const current = Math.min(
    maximum,
    Math.max(minimum, enemy.position[config.axis]),
  );
  const phase =
    enemy.patrolDirection === 1
      ? current - minimum
      : routeLength + (maximum - current);
  const nextPhase = period === 0 ? 0 : (phase + distance) % period;
  const movingForward = nextPhase < routeLength;
  const coordinate = movingForward
    ? minimum + nextPhase
    : maximum - (nextPhase - routeLength);

  return {
    ...enemy,
    mode: "patrol",
    position: {
      ...enemy.position,
      [config.axis]: coordinate,
    },
    patrolDirection: movingForward ? 1 : -1,
  };
}

export function stepEnemyPatrol<T extends EnemyAiState>(
  enemy: T,
  config: EnemyAiConfig["patrol"],
  deltaMs: number,
): T {
  assertDelta(deltaMs);
  if (enemy.mode === "dead" || deltaMs === 0) {
    return enemy;
  }
  const deltaSeconds = deltaMs / 1_000;
  const patrolPoint = getClosestPatrolPoint(enemy, config);
  if (!isOnPatrolRoute(enemy.position, patrolPoint)) {
    return {
      ...enemy,
      mode: "patrol",
      position: moveToward(
        enemy.position,
        patrolPoint,
        config.speed * deltaSeconds,
      ),
    };
  }
  return advancePatrol(
    { ...enemy, mode: "patrol" as const, position: patrolPoint },
    config,
    config.speed * deltaSeconds,
  );
}

export function stepEnemyChase<T extends EnemyAiState>(
  enemy: T,
  playerPosition: Position,
  config: ChaseConfig,
  deltaMs: number,
): T {
  assertDelta(deltaMs);
  if (enemy.mode === "dead" || deltaMs === 0) {
    return enemy;
  }
  const deltaSeconds = deltaMs / 1_000;
  const distance = distanceBetween(enemy.position, playerPosition);
  if (distance <= config.stopDistance) {
    return { ...enemy, mode: "chase" };
  }
  const travel = Math.min(
    config.speed * deltaSeconds,
    distance - config.stopDistance,
  );
  return {
    ...enemy,
    mode: "chase",
    position: moveToward(enemy.position, playerPosition, travel),
  };
}

export function stepEnemyAi<T extends EnemyAiState>(
  enemy: T,
  playerPosition: Position,
  config: EnemyAiConfig,
  deltaMs: number,
): T {
  assertDelta(deltaMs);
  if (enemy.mode === "dead" || deltaMs === 0) {
    return enemy;
  }

  const nextMode = resolveEnemyMode(
    enemy.mode,
    enemy.position,
    playerPosition,
    config.chase,
  );

  if (nextMode === "chase") {
    return stepEnemyChase(enemy, playerPosition, config.chase, deltaMs);
  }

  return stepEnemyPatrol(enemy, config.patrol, deltaMs);
}
