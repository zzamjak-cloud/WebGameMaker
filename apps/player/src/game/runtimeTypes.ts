export type RuntimePhase = 'loading' | 'booting' | 'ready' | 'destroying' | 'error';
export type PulsePhase = 'idle' | 'destroying' | 'creating' | 'ready';

export interface RuntimeProbeSnapshot {
  assets: {
    png: {
      sourceWidth: number;
      sourceHeight: number;
      displayWidth: number;
      displayHeight: number;
      scaleX: number;
      scaleY: number;
    };
    svg: {
      sourceWidth: number;
      sourceHeight: number;
      displayWidth: number;
      displayHeight: number;
      scaleX: number;
      scaleY: number;
    };
  };
  player: {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    displayWidth: number;
    displayHeight: number;
  };
  camera: {
    scrollX: number;
    scrollY: number;
    zoom: number;
  };
  barrier: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    displayWidth: number;
    displayHeight: number;
  };
  collision: {
    count: number;
    blockedRight: boolean;
    touchingRight: boolean;
  };
}

export interface RuntimeSnapshot {
  phase: RuntimePhase;
  generation: number;
  createCount: number;
  destroyCount: number;
  completedRecreateCycles: number;
  errorMessage: string | null;
  assets: {
    png: boolean;
    svg: boolean;
  };
  systems: {
    physics: boolean;
    collision: boolean;
    keyboard: boolean;
    camera: boolean;
  };
  resources: {
    canvasCount: number;
    activeListeners: number;
    activeTimers: number;
    orphanCanvases: number;
    orphanListeners: number;
    orphanTimers: number;
  };
  pulses: [PulsePhase, PulsePhase, PulsePhase];
}

export interface PlayerRuntimeController {
  destroy: () => Promise<void>;
  getProbeSnapshot: () => RuntimeProbeSnapshot | null;
  getSnapshot: () => RuntimeSnapshot;
  recreate: (cycles: number) => Promise<RuntimeSnapshot>;
}

export const INITIAL_RUNTIME_SNAPSHOT: RuntimeSnapshot = {
  phase: 'loading',
  generation: 0,
  createCount: 0,
  destroyCount: 0,
  completedRecreateCycles: 0,
  errorMessage: null,
  assets: {
    png: false,
    svg: false,
  },
  systems: {
    physics: false,
    collision: false,
    keyboard: false,
    camera: false,
  },
  resources: {
    canvasCount: 0,
    activeListeners: 0,
    activeTimers: 0,
    orphanCanvases: 0,
    orphanListeners: 0,
    orphanTimers: 0,
  },
  pulses: ['idle', 'idle', 'idle'],
};

export function cloneRuntimeSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  return {
    ...snapshot,
    assets: { ...snapshot.assets },
    systems: { ...snapshot.systems },
    resources: { ...snapshot.resources },
    pulses: [...snapshot.pulses],
  };
}
