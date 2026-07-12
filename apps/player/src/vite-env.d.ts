/// <reference types="vite/client" />

import type { RuntimeProbeSnapshot, RuntimeSnapshot } from './game/runtimeTypes';

interface PlayerTestSnapshot extends RuntimeSnapshot {
  bridge: {
    readyCount: number;
    pingCount: number;
    pongCount: number;
    lastRequestId: string | null;
  };
  probe: RuntimeProbeSnapshot | null;
}

declare global {
  interface Window {
    __WGM_PLAYER_TEST__?: {
      destroy: () => Promise<PlayerTestSnapshot>;
      recreate: (cycles?: number) => Promise<PlayerTestSnapshot>;
      snapshot: () => PlayerTestSnapshot;
    };
  }
}

export {};
