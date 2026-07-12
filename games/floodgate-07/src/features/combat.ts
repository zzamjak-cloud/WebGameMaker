import type { SearchlightConfig } from "../compileProject.js";
import type {
  EnemyState,
  Facing,
  GameState,
} from "../gameState.js";

export interface ContactDamageInput {
  damage: number;
  nowMs: number;
  invulnerabilityMs: number;
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}는 0 이상의 유한한 숫자여야 합니다.`);
  }
}

export function applyContactDamage(
  state: GameState,
  input: ContactDamageInput,
): GameState {
  assertNonNegativeFinite(input.damage, "damage");
  assertNonNegativeFinite(input.nowMs, "nowMs");
  assertNonNegativeFinite(input.invulnerabilityMs, "invulnerabilityMs");
  if (
    state.phase !== "playing" ||
    input.damage === 0 ||
    input.nowMs < state.player.invulnerableUntil
  ) {
    return state;
  }

  const health = Math.max(0, state.player.health - input.damage);
  return {
    ...state,
    phase: health === 0 ? "lost" : state.phase,
    player: {
      ...state.player,
      health,
      invulnerableUntil: input.nowMs + input.invulnerabilityMs,
    },
  };
}

function facingVector(facing: Facing): { x: number; y: number } {
  switch (facing) {
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
  }
}

export function findSearchlightTargets(
  state: GameState,
  config: Pick<SearchlightConfig, "range" | "halfAngleDegrees">,
): string[] {
  const facing = facingVector(state.player.facing);
  const minimumDot = Math.cos((config.halfAngleDegrees * Math.PI) / 180);

  return state.enemies
    .filter((enemy) => enemy.mode !== "dead")
    .filter((enemy) => {
      const offsetX = enemy.position.x - state.player.position.x;
      const offsetY = enemy.position.y - state.player.position.y;
      const distance = Math.hypot(offsetX, offsetY);
      if (distance === 0) {
        return true;
      }
      if (distance > config.range) {
        return false;
      }
      const dot = (offsetX * facing.x + offsetY * facing.y) / distance;
      return dot >= minimumDot;
    })
    .map((enemy) => enemy.id)
    .sort();
}

function damageEnemy(enemy: EnemyState, damage: number): EnemyState {
  if (enemy.mode === "dead") {
    return enemy;
  }
  const health = Math.max(0, enemy.health - damage);
  return {
    ...enemy,
    health,
    mode: health === 0 ? "dead" : enemy.mode,
  };
}

export function applySearchlightPulse(
  state: GameState,
  targetEnemyIds: readonly string[],
  config: SearchlightConfig,
  nowMs: number,
): GameState {
  assertNonNegativeFinite(nowMs, "nowMs");
  if (state.phase !== "playing" || state.lamp.overheated) {
    return state;
  }

  const targets = new Set(targetEnemyIds);
  const enemies = state.enemies.map((enemy) =>
    targets.has(enemy.id) ? damageEnemy(enemy, config.damage) : enemy,
  );
  const previousDead = state.enemies.filter(
    (enemy) => enemy.mode === "dead",
  ).length;
  const dead = enemies.filter((enemy) => enemy.mode === "dead").length;
  const newKills = Math.max(0, dead - previousDead);
  const litBeacons = Math.min(
    state.objective.totalBeacons,
    state.objective.litBeacons + newKills,
  );
  const heat = Math.min(100, state.lamp.heat + config.heatPerPulse);
  const overheated = heat >= 100;
  const won = enemies.every((enemy) => enemy.mode === "dead");

  return {
    ...state,
    phase: won ? "won" : state.phase,
    enemies,
    lamp: {
      heat,
      overheated,
      overheatedUntil: overheated
        ? nowMs + config.overheatLockMs
        : state.lamp.overheatedUntil,
    },
    objective: {
      ...state.objective,
      litBeacons,
    },
  };
}

export function coolSearchlight(
  state: GameState,
  config: SearchlightConfig,
  deltaMs: number,
  nowMs: number,
): GameState {
  assertNonNegativeFinite(deltaMs, "deltaMs");
  assertNonNegativeFinite(nowMs, "nowMs");
  if (state.phase !== "playing" || deltaMs === 0) {
    return state;
  }

  const heat = Math.max(
    0,
    state.lamp.heat - config.coolingPerSecond * (deltaMs / 1_000),
  );
  const recovered =
    state.lamp.overheated &&
    nowMs >= state.lamp.overheatedUntil &&
    heat <= config.recoveryHeat;

  return {
    ...state,
    lamp: {
      heat,
      overheated: recovered ? false : state.lamp.overheated,
      overheatedUntil: recovered ? 0 : state.lamp.overheatedUntil,
    },
  };
}
