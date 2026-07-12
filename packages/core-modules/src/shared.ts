export interface Position {
  x: number;
  y: number;
}

export type Facing = "up" | "down" | "left" | "right";
export type EnemyMode = "patrol" | "chase" | "dead";

export interface MovementInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface MovementIntent {
  velocity: Position;
  facing: Facing;
}

export interface MovementBounds {
  width: number;
  height: number;
  padding?: number;
}

export interface PatrolConfig {
  axis: "x" | "y";
  distance: number;
  speed: number;
}

export interface ChaseConfig {
  detectionDistance: number;
  disengageDistance: number;
  speed: number;
  stopDistance: number;
}

export interface EnemyAiConfig {
  patrol: PatrolConfig;
  chase: ChaseConfig;
}

export interface EnemyAiState {
  mode: EnemyMode;
  position: Position;
  patrolOrigin: Position;
  patrolDirection: -1 | 1;
}

export function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}는 0 이상의 유한한 숫자여야 합니다.`);
  }
}

export function distanceBetween(left: Position, right: Position): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}
