import type {
  EnemyMode,
  Facing,
  GamePhase,
} from '@web-game-maker/floodgate-07';

export type VerticalSlicePhase = 'loading' | GamePhase | 'destroyed' | 'error';

export interface VerticalSliceEnemySnapshot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly mode: EnemyMode;
  readonly alive: boolean;
  readonly patrolDirection: -1 | 1;
  readonly chaseTransitions: number;
}

export interface VerticalSliceBeaconSnapshot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly lit: boolean;
}

export interface VerticalSliceResourceSnapshot {
  readonly canvasCount: number;
  readonly listeners: number;
  readonly timers: number;
  readonly colliders: number;
  readonly orphanCanvases: number;
  readonly orphanListeners: number;
  readonly orphanTimers: number;
}

export interface VerticalSliceSnapshot {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly sceneId: string;
  readonly phase: VerticalSlicePhase;
  readonly errorMessage: string | null;
  readonly tick: number;
  readonly fixedDeltaMs: number;
  readonly manualSimulation: boolean;
  readonly assets: {
    readonly png: boolean;
    readonly svg: boolean;
  };
  readonly run: {
    readonly runId: number;
    readonly restartCount: number;
    readonly elapsedMs: number;
  };
  readonly input: {
    readonly focused: boolean;
    readonly pressedKeys: readonly string[];
  };
  readonly player: {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly velocityX: number;
    readonly velocityY: number;
    readonly facing: Facing;
    readonly health: number;
    readonly maxHealth: number;
    readonly invulnerable: boolean;
  };
  readonly lamp: {
    readonly heat: number;
    readonly overheated: boolean;
    readonly cooldownRemainingMs: number;
    readonly range: number;
    readonly halfAngleDegrees: number;
  };
  readonly enemies: readonly VerticalSliceEnemySnapshot[];
  readonly beacons: readonly VerticalSliceBeaconSnapshot[];
  readonly objective: {
    readonly litBeacons: number;
    readonly totalBeacons: number;
    readonly remainingEnemies: number;
  };
  readonly combat: {
    readonly attackCount: number;
    readonly attackHits: number;
    readonly contactHits: number;
    readonly lastTargetIds: readonly string[];
  };
  readonly resources: VerticalSliceResourceSnapshot;
}

export interface VerticalSliceController {
  snapshot(): VerticalSliceSnapshot;
  restart(): Promise<VerticalSliceSnapshot>;
  destroy(): Promise<VerticalSliceSnapshot>;
  advanceTicks(count: number): Promise<VerticalSliceSnapshot>;
}

export type VerticalSliceSnapshotListener = (snapshot: VerticalSliceSnapshot) => void;
