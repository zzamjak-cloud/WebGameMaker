import type { EnemyConfig, Position } from "../compileProject.js";
import type { EnemyMode, EnemyState } from "../gameState.js";

const ROUTE_EPSILON = 0.001;

function assertDelta(deltaMs: number): void {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    throw new Error("deltaMs는 0 이상의 유한한 숫자여야 합니다.");
  }
}

export function distanceBetween(left: Position, right: Position): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export function resolveEnemyMode(
  mode: EnemyMode,
  enemyPosition: Position,
  playerPosition: Position,
  config: EnemyConfig["chase"],
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
  enemy: EnemyState,
  config: EnemyConfig["patrol"],
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

function isOnPatrolRoute(
  position: Position,
  patrolPoint: Position,
): boolean {
  return distanceBetween(position, patrolPoint) <= ROUTE_EPSILON;
}

function advancePatrol(
  enemy: EnemyState,
  config: EnemyConfig["patrol"],
  distance: number,
): EnemyState {
  const minimum =
    enemy.patrolOrigin[config.axis] - config.distance;
  const maximum =
    enemy.patrolOrigin[config.axis] + config.distance;
  const routeLength = maximum - minimum;
  const period = routeLength * 2;
  const current = Math.min(maximum, Math.max(minimum, enemy.position[config.axis]));
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

export function stepEnemyAi(
  enemy: EnemyState,
  playerPosition: Position,
  config: EnemyConfig,
  deltaMs: number,
): EnemyState {
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
  const deltaSeconds = deltaMs / 1_000;

  if (nextMode === "chase") {
    const distance = distanceBetween(enemy.position, playerPosition);
    if (distance <= config.chase.stopDistance) {
      return { ...enemy, mode: "chase" };
    }
    const travel = Math.min(
      config.chase.speed * deltaSeconds,
      distance - config.chase.stopDistance,
    );
    return {
      ...enemy,
      mode: "chase",
      position: moveToward(enemy.position, playerPosition, travel),
    };
  }

  const patrolPoint = getClosestPatrolPoint(enemy, config.patrol);
  if (!isOnPatrolRoute(enemy.position, patrolPoint)) {
    return {
      ...enemy,
      mode: "patrol",
      position: moveToward(
        enemy.position,
        patrolPoint,
        config.patrol.speed * deltaSeconds,
      ),
    };
  }

  return advancePatrol(
    { ...enemy, mode: "patrol", position: patrolPoint },
    config.patrol,
    config.patrol.speed * deltaSeconds,
  );
}
