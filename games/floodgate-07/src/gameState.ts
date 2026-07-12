import type {
  FloodgateProjectConfig,
  Position,
} from "./compileProject.js";

export type GamePhase = "playing" | "won" | "lost";
export type Facing = "up" | "down" | "left" | "right";
export type EnemyMode = "patrol" | "chase" | "dead";

export interface PlayerState {
  id: string;
  health: number;
  maxHealth: number;
  position: Position;
  facing: Facing;
  invulnerableUntil: number;
}

export interface LampState {
  heat: number;
  overheated: boolean;
  overheatedUntil: number;
}

export interface EnemyState {
  id: string;
  health: number;
  maxHealth: number;
  mode: EnemyMode;
  position: Position;
  patrolOrigin: Position;
  patrolDirection: -1 | 1;
}

export interface ObjectiveState {
  litBeacons: number;
  totalBeacons: number;
}

export interface RunState {
  runId: number;
  elapsedMs: number;
}

export interface GameState {
  phase: GamePhase;
  player: PlayerState;
  lamp: LampState;
  enemies: readonly EnemyState[];
  objective: ObjectiveState;
  run: RunState;
}

function normalizeRunId(runId: number): number {
  if (!Number.isInteger(runId) || runId < 1) {
    throw new Error("runId는 1 이상의 정수여야 합니다.");
  }
  return runId;
}

export function createInitialGameState(
  config: FloodgateProjectConfig,
  runId = 1,
): GameState {
  return {
    phase: "playing",
    player: {
      id: config.player.id,
      health: config.player.health.current,
      maxHealth: config.player.health.maximum,
      position: { ...config.player.spawn },
      facing: "up",
      invulnerableUntil: 0,
    },
    lamp: {
      heat: 0,
      overheated: false,
      overheatedUntil: 0,
    },
    enemies: config.enemies.map((enemy, index) => ({
      id: enemy.id,
      health: enemy.health.current,
      maxHealth: enemy.health.maximum,
      mode: "patrol",
      position: { ...enemy.spawn },
      patrolOrigin: { ...enemy.spawn },
      patrolDirection: index % 2 === 0 ? 1 : -1,
    })),
    objective: {
      litBeacons: 0,
      totalBeacons: config.beacons.length,
    },
    run: {
      runId: normalizeRunId(runId),
      elapsedMs: 0,
    },
  };
}

export function restartGameState(
  config: FloodgateProjectConfig,
  previousState: GameState,
): GameState {
  return createInitialGameState(config, previousState.run.runId + 1);
}

export function advanceElapsedMs(
  state: GameState,
  deltaMs: number,
): GameState {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    throw new Error("deltaMs는 0 이상의 유한한 숫자여야 합니다.");
  }
  if (state.phase !== "playing" || deltaMs === 0) {
    return state;
  }
  return {
    ...state,
    run: {
      ...state.run,
      elapsedMs: state.run.elapsedMs + deltaMs,
    },
  };
}

export function updatePlayerPose(
  state: GameState,
  position: Position,
  facing: Facing,
): GameState {
  if (state.phase !== "playing") {
    return state;
  }
  return {
    ...state,
    player: {
      ...state.player,
      position: { ...position },
      facing,
    },
  };
}

export function replaceEnemyState(
  state: GameState,
  enemy: EnemyState,
): GameState {
  const enemyIndex = state.enemies.findIndex(
    (candidate) => candidate.id === enemy.id,
  );
  if (enemyIndex < 0) {
    throw new Error(`적 상태를 찾을 수 없습니다: ${enemy.id}`);
  }
  const enemies = [...state.enemies];
  enemies[enemyIndex] = enemy;
  return {
    ...state,
    enemies,
  };
}
