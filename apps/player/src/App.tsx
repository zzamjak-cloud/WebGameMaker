import { useEffect, useRef, useState } from 'react';
import {
  cloneRuntimeSnapshot,
  INITIAL_RUNTIME_SNAPSHOT,
  type PlayerRuntimeController,
  type PulsePhase,
  type RuntimeSnapshot,
} from './game/runtimeTypes';

const BRIDGE_CHANNEL = 'web-game-maker/player';
const BRIDGE_VERSION = 1;

interface BridgeSnapshot {
  readyCount: number;
  pingCount: number;
  pongCount: number;
  lastRequestId: string | null;
}

interface BridgeMessage {
  channel: typeof BRIDGE_CHANNEL;
  version: typeof BRIDGE_VERSION;
  type: 'ping';
  requestId: string;
}

function getExpectedParentOrigin(): string | null {
  const candidate = new URLSearchParams(window.location.search).get('parentOrigin');

  if (!candidate) {
    return null;
  }

  try {
    const parsed = new URL(candidate);
    return parsed.origin === candidate ? candidate : null;
  } catch {
    return null;
  }
}

function canAccessParentDom(): boolean {
  try {
    return window.parent.document.documentElement !== null;
  } catch {
    return false;
  }
}

const INITIAL_BRIDGE_SNAPSHOT: BridgeSnapshot = {
  readyCount: 0,
  pingCount: 0,
  pongCount: 0,
  lastRequestId: null,
};

const PHASE_LABELS: Record<RuntimeSnapshot['phase'], string> = {
  loading: '모듈 로드',
  booting: '부팅 중',
  ready: '호환',
  destroying: '정리 중',
  error: '확인 필요',
};

const PULSE_LABELS: Record<PulsePhase, string> = {
  idle: '대기',
  destroying: '정리',
  creating: '생성',
  ready: '통과',
};

function isBridgePing(value: unknown): value is BridgeMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<BridgeMessage>;
  return (
    candidate.channel === BRIDGE_CHANNEL &&
    candidate.version === BRIDGE_VERSION &&
    candidate.type === 'ping' &&
    typeof candidate.requestId === 'string'
  );
}

function StatusLine({ label, ready }: { label: string; ready: boolean }) {
  return (
    <li className="status-line" data-ready={String(ready)}>
      <span className="status-dot" aria-hidden="true" />
      <span>{label}</span>
      <strong>{ready ? 'READY' : 'WAIT'}</strong>
    </li>
  );
}

export default function App() {
  const gameHostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PlayerRuntimeController | null>(null);
  const snapshotRef = useRef<RuntimeSnapshot>(cloneRuntimeSnapshot(INITIAL_RUNTIME_SNAPSHOT));
  const bridgeRef = useRef<BridgeSnapshot>({ ...INITIAL_BRIDGE_SNAPSHOT });
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(() =>
    cloneRuntimeSnapshot(INITIAL_RUNTIME_SNAPSHOT),
  );
  const [bridge, setBridge] = useState<BridgeSnapshot>(() => ({
    ...INITIAL_BRIDGE_SNAPSHOT,
  }));

  useEffect(() => {
    const parent = gameHostRef.current;

    if (!parent) {
      return undefined;
    }

    let cancelled = false;
    const expectedParentOrigin = getExpectedParentOrigin();
    const updateBridge = (next: BridgeSnapshot) => {
      bridgeRef.current = next;
      if (!cancelled) {
        setBridge(next);
      }
    };

    const announceReady = (runtimeSnapshot: RuntimeSnapshot) => {
      if (window.parent === window || !expectedParentOrigin) {
        return;
      }

      window.parent.postMessage(
        {
          channel: BRIDGE_CHANNEL,
          version: BRIDGE_VERSION,
          type: 'ready',
          generation: runtimeSnapshot.generation,
          parentDomAccessible: canAccessParentDom(),
        },
        expectedParentOrigin,
      );
      updateBridge({
        ...bridgeRef.current,
        readyCount: bridgeRef.current.readyCount + 1,
      });
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        !expectedParentOrigin ||
        event.source !== window.parent ||
        event.origin !== expectedParentOrigin ||
        !isBridgePing(event.data)
      ) {
        return;
      }

      const nextBridge = {
        ...bridgeRef.current,
        pingCount: bridgeRef.current.pingCount + 1,
        pongCount: bridgeRef.current.pongCount + 1,
        lastRequestId: event.data.requestId,
      };
      updateBridge(nextBridge);
      // opaque-origin iframe에서는 origin 추론 대신 검증된 부모 WindowProxy에만 응답한다.
      (event.source as Window).postMessage(
        {
          channel: BRIDGE_CHANNEL,
          version: BRIDGE_VERSION,
          type: 'pong',
          requestId: event.data.requestId,
          generation: snapshotRef.current.generation,
        },
        expectedParentOrigin,
      );
    };

    window.addEventListener('message', onMessage);

    const controllerPromise = import('./game/playerRuntime').then(async ({ createPlayerRuntime }) => {
      const controller = await createPlayerRuntime(parent, (nextSnapshot) => {
        snapshotRef.current = nextSnapshot;
        if (!cancelled) {
          setSnapshot(nextSnapshot);
          if (nextSnapshot.phase === 'ready') {
            announceReady(nextSnapshot);
          }
        }
      });

      if (cancelled) {
        await controller.destroy();
        return controller;
      }

      runtimeRef.current = controller;
      return controller;
    });

    const createTestSnapshot = (controller: PlayerRuntimeController | null) => ({
      ...cloneRuntimeSnapshot(snapshotRef.current),
      bridge: { ...bridgeRef.current },
      probe: controller?.getProbeSnapshot() ?? null,
    });

    controllerPromise.catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Phaser 부팅에 실패했습니다.';
      const nextSnapshot: RuntimeSnapshot = {
        ...snapshotRef.current,
        phase: 'error',
        errorMessage,
      };
      snapshotRef.current = nextSnapshot;
      if (!cancelled) {
        setSnapshot(nextSnapshot);
      }
    });

    window.__WGM_PLAYER_TEST__ = {
      recreate: async (cycles = 1) => {
        const controller = await controllerPromise;
        await controller.recreate(cycles);
        return createTestSnapshot(controller);
      },
      snapshot: () => createTestSnapshot(runtimeRef.current),
      destroy: async () => {
        const controller = await controllerPromise;
        await controller.destroy();
        return createTestSnapshot(controller);
      },
    };

    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      delete window.__WGM_PLAYER_TEST__;
      const controller = runtimeRef.current;
      runtimeRef.current = null;
      if (controller) {
        void controller.destroy();
      }
    };
  }, []);

  const recreateThreeTimes = async () => {
    await runtimeRef.current?.recreate(3);
  };

  const readySystems = [
    snapshot.assets.png,
    snapshot.assets.svg,
    snapshot.systems.physics,
    snapshot.systems.collision,
    snapshot.systems.keyboard,
    snapshot.systems.camera,
  ].filter(Boolean).length;

  return (
    <main
      className="app-shell"
      data-testid="compat-status"
      data-phase={snapshot.phase}
      data-png-ready={String(snapshot.assets.png)}
      data-svg-ready={String(snapshot.assets.svg)}
      data-physics-ready={String(snapshot.systems.physics)}
      data-collision-ready={String(snapshot.systems.collision)}
      data-keyboard-ready={String(snapshot.systems.keyboard)}
      data-camera-ready={String(snapshot.systems.camera)}
      data-canvas-count={String(snapshot.resources.canvasCount)}
      data-orphan-canvases={String(snapshot.resources.orphanCanvases)}
      data-orphan-listeners={String(snapshot.resources.orphanListeners)}
      data-orphan-timers={String(snapshot.resources.orphanTimers)}
      data-completed-cycles={String(snapshot.completedRecreateCycles)}
    >
      <header className="topbar">
        <div>
          <p className="eyebrow">PHASE 0 · COMPATIBILITY BENCH</p>
          <h1>게임 런타임 계측대</h1>
          <p className="subtitle">기획·개발·디자인이 같은 실행 상태를 판별하는 Phaser 4 기준면</p>
        </div>
        <div className="phase-badge" data-phase={snapshot.phase} aria-live="polite">
          <span aria-hidden="true" />
          {PHASE_LABELS[snapshot.phase]}
        </div>
      </header>

      <section className="bench-layout">
        <article className="viewport-panel" aria-label="Phaser 실행 화면">
          <div className="panel-heading">
            <div>
              <span className="panel-index">VIEW / 960×540</span>
              <h2>탑다운 액션 샘플</h2>
            </div>
            <span className="generation-readout">GEN {String(snapshot.generation).padStart(2, '0')}</span>
          </div>

          <div className="viewport-stage">
            <span className="axis-label axis-label-x">X 000—1600</span>
            <span className="axis-label axis-label-y">Y 000—0900</span>
            <div ref={gameHostRef} className="game-host" data-testid="game-host" />
          </div>

          <footer className="viewport-footer">
            <span>WASD / 방향키</span>
            <span>Arcade Physics · Camera follow</span>
            <span>PNG + SVG data URI</span>
          </footer>
        </article>

        <aside className="diagnostic-rail" aria-label="런타임 진단">
          <section className="rail-section rail-summary">
            <p className="rail-label">준비 신호</p>
            <div className="summary-count">
              <strong>{readySystems}</strong>
              <span>/ 6</span>
            </div>
            <ul className="status-list">
              <StatusLine label="PNG texture" ready={snapshot.assets.png} />
              <StatusLine label="SVG texture" ready={snapshot.assets.svg} />
              <StatusLine label="Arcade body" ready={snapshot.systems.physics} />
              <StatusLine label="Collision" ready={snapshot.systems.collision} />
              <StatusLine label="Keyboard" ready={snapshot.systems.keyboard} />
              <StatusLine label="Camera" ready={snapshot.systems.camera} />
            </ul>
          </section>

          <section className="rail-section lifecycle-section">
            <div className="rail-title-row">
              <div>
                <p className="rail-label">수명주기 펄스</p>
                <h2>Destroy → Create</h2>
              </div>
              <span>{snapshot.completedRecreateCycles}/3</span>
            </div>

            <ol className="pulse-timeline" data-testid="lifecycle-timeline">
              {snapshot.pulses.map((pulse, index) => (
                <li key={index} data-state={pulse}>
                  <span className="pulse-node" aria-hidden="true" />
                  <div>
                    <b>CYCLE {index + 1}</b>
                    <span>{PULSE_LABELS[pulse]}</span>
                  </div>
                </li>
              ))}
            </ol>

            <button
              className="recreate-button"
              type="button"
              onClick={() => void recreateThreeTimes()}
              disabled={snapshot.phase !== 'ready'}
            >
              런타임 3회 재생성
            </button>
          </section>

          <section className="rail-section resource-section">
            <p className="rail-label">정리 검사</p>
            <dl className="resource-grid">
              <div>
                <dt>Canvas</dt>
                <dd>{snapshot.resources.orphanCanvases}</dd>
              </div>
              <div>
                <dt>Listener</dt>
                <dd>{snapshot.resources.orphanListeners}</dd>
              </div>
              <div>
                <dt>Timer</dt>
                <dd>{snapshot.resources.orphanTimers}</dd>
              </div>
            </dl>
            <p className="resource-note">현재 관리 중 {snapshot.resources.activeListeners}L · {snapshot.resources.activeTimers}T</p>
          </section>

          <section className="bridge-strip" aria-label="iframe 브리지 상태">
            <span>POSTMESSAGE / V{BRIDGE_VERSION}</span>
            <strong>{bridge.pongCount > 0 ? 'PONG' : 'READY'}</strong>
          </section>
        </aside>
      </section>

      {snapshot.errorMessage ? (
        <p className="error-banner" role="alert">
          {snapshot.errorMessage}
        </p>
      ) : null}
    </main>
  );
}
