import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  VerticalSliceController,
  VerticalSlicePhase,
  VerticalSliceSnapshot,
} from './verticalSliceTypes';

interface VerticalSliceTestApi {
  readonly version: 1;
  snapshot: () => VerticalSliceSnapshot;
  advanceTicks: (count: number) => Promise<VerticalSliceSnapshot>;
  restart: () => Promise<VerticalSliceSnapshot>;
}

type VerticalSliceTestWindow = Window &
  typeof globalThis & {
    __WGM_VERTICAL_SLICE_TEST__?: VerticalSliceTestApi;
  };

const PHASE_LABELS: Record<VerticalSlicePhase, string> = {
  loading: '수문 연결 중',
  playing: '야간 순찰 중',
  won: '등불 복구 완료',
  lost: '신호 소실',
  destroyed: '운영 종료',
  error: '점검 필요',
};

// StrictMode의 effect 재실행과 실제 remount가 이전 Phaser 정리보다 앞서지 않게 한 인스턴스씩 임대한다.
let verticalSliceLifecycleQueue: Promise<void> = Promise.resolve();

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function VerticalSliceView() {
  const gameHostRef = useRef<HTMLDivElement>(null);
  const resultButtonRef = useRef<HTMLButtonElement>(null);
  const runtimeRef = useRef<VerticalSliceController | null>(null);
  const snapshotRef = useRef<VerticalSliceSnapshot | null>(null);
  const [snapshot, setSnapshot] = useState<VerticalSliceSnapshot | null>(null);
  const [debugVisible, setDebugVisible] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const parent = gameHostRef.current;

    if (!parent) {
      return undefined;
    }

    let cancelled = false;
    let ownedController: VerticalSliceController | null = null;
    let ownedTestApi: VerticalSliceTestApi | null = null;
    let requestCleanup: () => void = () => undefined;
    const cleanupRequested = new Promise<void>((resolve) => {
      requestCleanup = resolve;
    });
    const testWindow = window as VerticalSliceTestWindow;
    const e2eEnabled =
      window.parent === window && new URLSearchParams(window.location.search).get('e2e') === '1';

    const commitSnapshot = (nextSnapshot: VerticalSliceSnapshot) => {
      if (cancelled) {
        return;
      }
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
    };

    const lifecycleTask = verticalSliceLifecycleQueue.then(async () => {
      if (cancelled) {
        return;
      }

      const { createVerticalSliceRuntime } = await import('./verticalSliceRuntime');
      if (cancelled) {
        return;
      }

      const controller = await createVerticalSliceRuntime(parent, commitSnapshot);

      if (cancelled) {
        await controller.destroy();
        return;
      }

      ownedController = controller;
      runtimeRef.current = controller;
      commitSnapshot(controller.snapshot());

      if (e2eEnabled) {
        ownedTestApi = {
          version: 1,
          snapshot: () => controller.snapshot(),
          advanceTicks: async (count: number) => {
            const nextSnapshot = await controller.advanceTicks(count);
            commitSnapshot(nextSnapshot);
            return nextSnapshot;
          },
          restart: async () => {
            const nextSnapshot = await controller.restart();
            commitSnapshot(nextSnapshot);
            return nextSnapshot;
          },
        };
        testWindow.__WGM_VERTICAL_SLICE_TEST__ = ownedTestApi;
      }

      await cleanupRequested;
      if (ownedTestApi && testWindow.__WGM_VERTICAL_SLICE_TEST__ === ownedTestApi) {
        delete testWindow.__WGM_VERTICAL_SLICE_TEST__;
      }
      if (runtimeRef.current === controller) {
        runtimeRef.current = null;
      }
      await controller.destroy();
    });
    verticalSliceLifecycleQueue = lifecycleTask.then(
      () => undefined,
      () => undefined,
    );

    lifecycleTask.catch((error: unknown) => {
      if (cancelled) {
        return;
      }
      setLocalError(error instanceof Error ? error.message : '수문 런타임을 시작하지 못했습니다.');
    });

    return () => {
      cancelled = true;
      if (ownedTestApi && testWindow.__WGM_VERTICAL_SLICE_TEST__ === ownedTestApi) {
        delete testWindow.__WGM_VERTICAL_SLICE_TEST__;
      }
      if (ownedController) {
        if (runtimeRef.current === ownedController) {
          runtimeRef.current = null;
        }
      }
      requestCleanup();
    };
  }, []);

  const restartRun = useCallback(async () => {
    const controller = runtimeRef.current;

    if (!controller || restarting) {
      return;
    }

    setRestarting(true);
    setLocalError(null);
    try {
      const nextSnapshot = await controller.restart();
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
      gameHostRef.current?.querySelector('canvas')?.focus();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '순찰을 다시 시작하지 못했습니다.');
    } finally {
      setRestarting(false);
    }
  }, [restarting]);

  const phase = snapshot?.phase ?? 'loading';
  const resultVisible = phase === 'won' || phase === 'lost';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      if (event.key === 'F3') {
        event.preventDefault();
        setDebugVisible((visible) => !visible);
      } else if ((event.key === 'r' || event.key === 'R') && resultVisible) {
        event.preventDefault();
        void restartRun();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [restartRun, resultVisible]);

  useEffect(() => {
    if (resultVisible) {
      resultButtonRef.current?.focus();
    }
  }, [resultVisible]);

  const totalBeacons = snapshot?.objective.totalBeacons ?? 3;
  const litBeacons = snapshot?.objective.litBeacons ?? 0;
  const beaconStates = Array.from(
    { length: totalBeacons },
    (_, index) => snapshot?.beacons[index]?.lit ?? index < litBeacons,
  );
  const playerHealth = snapshot?.player.health ?? 100;
  const playerMaxHealth = snapshot?.player.maxHealth ?? 100;
  const healthPercent = clampPercent((playerHealth / Math.max(1, playerMaxHealth)) * 100);
  const heatPercent = clampPercent(snapshot?.lamp.heat ?? 0);
  const remainingEnemies = snapshot?.objective.remainingEnemies;
  const elapsed = formatElapsed(snapshot?.run.elapsedMs ?? 0);
  const errorMessage = localError ?? snapshot?.errorMessage ?? null;
  const lampStatus = snapshot?.lamp.overheated
    ? `냉각 중 ${(snapshot.lamp.cooldownRemainingMs / 1_000).toFixed(1)}초`
    : '조사광';
  const liveMessage =
    phase === 'won'
      ? '수문 07의 세 등불을 모두 복구했습니다.'
      : phase === 'lost'
        ? '선체가 파손되어 등불이 꺼졌습니다.'
        : snapshot?.lamp.overheated
          ? `조사광이 과열되었습니다. ${lampStatus}`
          : `신호등 ${litBeacons}/${totalBeacons}, 남은 먹물체 ${remainingEnemies ?? 0}`;

  return (
    <main
      className="vertical-slice-page"
      data-testid="vertical-slice-status"
      data-phase={phase}
      data-health={playerHealth}
      data-lit-beacons={litBeacons}
      data-heat={heatPercent}
      data-remaining-enemies={remainingEnemies ?? ''}
      data-run-id={snapshot?.run.runId ?? ''}
      data-restart-count={snapshot?.run.restartCount ?? ''}
    >
      <header className="slice-masthead">
        <div>
          <p className="slice-kicker">COASTAL GATE 07 · NIGHT WATCH</p>
          <h1>
            수문 07 <span>마지막 등불</span>
          </h1>
        </div>
        <div className="slice-phase-plate" data-phase={phase} aria-label={`현재 상태: ${PHASE_LABELS[phase]}`}>
          <span aria-hidden="true" />
          {PHASE_LABELS[phase]}
        </div>
      </header>

      <section className="slice-game-frame" aria-label="수문 07 탑다운 액션 게임">
        <div
          className="vertical-game-viewport"
          data-debug={String(debugVisible)}
          data-testid="vertical-game-viewport"
        >
          <div
            ref={gameHostRef}
            className="vertical-game-host"
            data-testid="vertical-game-host"
          />

          <div className="vertical-hud" data-debug={String(debugVisible)} aria-label="게임 HUD">
            <div className="hud-top-row">
              <section className="hud-instrument hull-instrument" data-anchor="ANCHOR / HULL">
                <div className="hud-label-row">
                  <span>선체</span>
                  <strong data-testid="hud-health">
                    {playerHealth}<small>/{playerMaxHealth}</small>
                  </strong>
                </div>
                <div
                  className="hull-track"
                  role="progressbar"
                  aria-label="선체 내구도"
                  aria-valuemin={0}
                  aria-valuemax={playerMaxHealth}
                  aria-valuenow={playerHealth}
                >
                  <span style={{ width: `${healthPercent}%` }} />
                </div>
              </section>

              <section className="beacon-instrument" data-anchor="ANCHOR / SIGNALS">
                <p>수문 신호등</p>
                <ol
                  className="beacon-sequence"
                  data-testid="hud-beacons"
                  aria-label={`신호등 ${litBeacons}/${totalBeacons}`}
                >
                  {beaconStates.map((lit, index) => (
                    <li key={index} data-lit={String(lit)} aria-label={`신호등 ${index + 1}: ${lit ? '점화' : '소등'}`}>
                      <span aria-hidden="true" />
                    </li>
                  ))}
                </ol>
                <strong>{litBeacons}/{totalBeacons}</strong>
              </section>

              <section
                className="hud-instrument heat-instrument"
                data-anchor="ANCHOR / LENS"
                role="meter"
                aria-label="렌즈 온도"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={heatPercent}
                data-overheated={String(snapshot?.lamp.overheated ?? false)}
              >
                <div className="heat-copy">
                  <span>렌즈 열</span>
                  <strong data-testid="hud-heat">{Math.round(heatPercent)}%</strong>
                </div>
                <svg className="fresnel-gauge" viewBox="0 0 100 58" aria-hidden="true">
                  <path className="fresnel-track" d="M 10 50 A 40 40 0 0 1 90 50" pathLength="100" />
                  <path
                    className="fresnel-fill"
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    pathLength="100"
                    strokeDasharray={`${heatPercent} 100`}
                  />
                  <path className="fresnel-inner" d="M 24 50 A 26 26 0 0 1 76 50" />
                </svg>
              </section>
            </div>

            <div className="hud-bottom-row">
              <button
                className="debug-toggle"
                type="button"
                aria-pressed={debugVisible}
                aria-keyshortcuts="F3"
                onClick={() => setDebugVisible((visible) => !visible)}
              >
                <kbd>F3</kbd> 제작 정보
              </button>

              <p id="slice-controls" className="attack-instruction" data-overheated={String(snapshot?.lamp.overheated ?? false)}>
                <kbd>SPACE</kbd>
                <span>{lampStatus}</span>
              </p>

              <div className="enemy-counter" data-anchor="ANCHOR / HOSTILES">
                <span>먹물체</span>
                <strong data-testid="hud-enemies">{remainingEnemies ?? '—'}</strong>
              </div>
            </div>

            {debugVisible && snapshot ? (
              <aside className="production-overlay" data-testid="production-overlay" aria-label="제작 정보">
                <div className="hud-safe-area" aria-hidden="true">
                  <span>HUD SAFE AREA · 5%</span>
                </div>
                <dl className="production-readout">
                  <div><dt>STATE</dt><dd>{snapshot.phase}</dd></div>
                  <div><dt>TICK</dt><dd>{snapshot.tick}</dd></div>
                  <div><dt>RUN</dt><dd>{snapshot.run.runId}</dd></div>
                  <div><dt>PLAYER</dt><dd>{snapshot.player.x.toFixed(0)}, {snapshot.player.y.toFixed(0)} · {snapshot.player.facing}</dd></div>
                  <div><dt>LAMP</dt><dd>{Math.round(snapshot.lamp.heat)}% · {snapshot.lamp.overheated ? 'LOCK' : 'READY'}</dd></div>
                  <div><dt>ENEMY AI</dt><dd>{snapshot.enemies.filter((enemy) => enemy.alive).map((enemy) => enemy.mode).join(' · ') || 'CLEAR'}</dd></div>
                  <div><dt>RESOURCES</dt><dd>{snapshot.resources.canvasCount}C · {snapshot.resources.listeners}L · {snapshot.resources.timers}T</dd></div>
                </dl>
              </aside>
            ) : null}
          </div>

          {!snapshot && !errorMessage ? (
            <div className="slice-boot-veil" role="status">
              <span>GATE 07 / LINK</span>
              <p>조수표와 등화 회로를 불러오는 중</p>
            </div>
          ) : null}

          {errorMessage && !resultVisible ? (
            <div className="slice-error-panel" role="alert">
              <span>운영 중단</span>
              <h2>수문 런타임을 확인하세요</h2>
              <p>{errorMessage}</p>
              {runtimeRef.current ? (
                <button type="button" onClick={() => void restartRun()} disabled={restarting}>
                  다시 연결
                </button>
              ) : null}
            </div>
          ) : null}

          {resultVisible && snapshot ? (
            <div className="result-scrim">
              <section
                className="result-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="result-title"
                aria-describedby="result-description"
                data-result={phase}
                data-testid="result-dialog"
              >
                <p className="result-code">GATE 07 · RUN {String(snapshot.run.runId).padStart(2, '0')}</p>
                <h2 id="result-title">{phase === 'won' ? '수문 07 재점화' : '등불이 꺼졌습니다'}</h2>
                <p id="result-description">
                  {phase === 'won'
                    ? '세 개의 신호등이 다시 해안선을 비춥니다.'
                    : '선체가 파손되었습니다. 등화 회로를 재가동하세요.'}
                </p>
                <dl className="result-stats">
                  <div><dt>신호등</dt><dd>{litBeacons}/{totalBeacons}</dd></div>
                  <div><dt>정리한 먹물체</dt><dd>{litBeacons}</dd></div>
                  <div><dt>순찰 시간</dt><dd>{elapsed}</dd></div>
                </dl>
                <button
                  ref={resultButtonRef}
                  className="restart-run-button"
                  type="button"
                  aria-keyshortcuts="R"
                  onClick={() => void restartRun()}
                  disabled={restarting}
                  data-testid="restart-button"
                >
                  {restarting ? '등화 회로 재가동 중' : phase === 'won' ? '다시 순찰' : '다시 출동'}
                  <kbd>R</kbd>
                </button>
              </section>
            </div>
          ) : null}

          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {liveMessage}
          </p>
        </div>
      </section>

      <footer className="slice-footer" aria-label="조작 안내">
        <span>WASD / 방향키 이동</span>
        <span>SPACE 조사광</span>
        <span>F3 제작 정보</span>
      </footer>
    </main>
  );
}
