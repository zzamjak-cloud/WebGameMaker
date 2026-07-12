import { expect, test, type Page } from '@playwright/test';

interface RuntimeProbeSnapshot {
  assets: {
    png: AssetProbeSnapshot;
    svg: AssetProbeSnapshot;
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

interface AssetProbeSnapshot {
  sourceWidth: number;
  sourceHeight: number;
  displayWidth: number;
  displayHeight: number;
  scaleX: number;
  scaleY: number;
}

interface CompatibilitySnapshot {
  phase: string;
  generation: number;
  createCount: number;
  destroyCount: number;
  completedRecreateCycles: number;
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
    orphanCanvases: number;
    orphanListeners: number;
    orphanTimers: number;
  };
  probe: RuntimeProbeSnapshot | null;
}

interface PlayerTestApi {
  destroy: () => Promise<CompatibilitySnapshot>;
  recreate: (cycles?: number) => Promise<CompatibilitySnapshot>;
  snapshot: () => CompatibilitySnapshot;
}

interface RuntimeResourceProbeSample {
  listenerCount: number;
  timerCount: number;
  windowListeners: number;
  documentListeners: number;
  otherListeners: number;
  timeouts: number;
  intervals: number;
  animationFrames: number;
  listenerDetails: Record<string, number>;
}

interface RuntimeResourceProbe {
  restore: () => void;
  sample: () => RuntimeResourceProbeSample;
}

type InstrumentedWindow = Window & {
  __WGM_PLAYER_TEST__?: PlayerTestApi;
  __WGM_RUNTIME_RESOURCE_PROBE__?: RuntimeResourceProbe;
};

async function installRuntimeResourceProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface TrackedListener {
      target: EventTarget;
      type: string;
      listener: EventListenerOrEventListenerObject;
      nativeListener: EventListenerOrEventListenerObject;
      capture: boolean;
      once: boolean;
      options?: boolean | AddEventListenerOptions;
      signal?: AbortSignal;
      abortListener?: EventListener;
    }

    const instrumentedWindow = window as InstrumentedWindow;
    const listenerRecords = new Set<TrackedListener>();
    const activeTimeouts = new Set<number>();
    const activeIntervals = new Set<number>();
    const activeAnimationFrames = new Set<number>();
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
    const originalSetTimeoutReference = window.setTimeout;
    const originalClearTimeoutReference = window.clearTimeout;
    const originalSetIntervalReference = window.setInterval;
    const originalClearIntervalReference = window.clearInterval;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    type BrowserSetTimer = (
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) => number;
    type BrowserClearTimer = (timerId?: number) => void;
    const originalSetTimeout = originalSetTimeoutReference.bind(window) as unknown as BrowserSetTimer;
    const originalClearTimeout = originalClearTimeoutReference.bind(
      window,
    ) as unknown as BrowserClearTimer;
    const originalSetInterval = originalSetIntervalReference.bind(
      window,
    ) as unknown as BrowserSetTimer;
    const originalClearInterval = originalClearIntervalReference.bind(
      window,
    ) as unknown as BrowserClearTimer;

    const captureOf = (options?: boolean | EventListenerOptions) =>
      typeof options === 'boolean' ? options : Boolean(options?.capture);

    const removeRecord = (record: TrackedListener, removeNative: boolean) => {
      if (!listenerRecords.delete(record)) {
        return;
      }

      if (removeNative) {
        originalRemoveEventListener.call(
          record.target,
          record.type,
          record.nativeListener,
          record.capture,
        );
      }

      if (record.signal && record.abortListener) {
        originalRemoveEventListener.call(record.signal, 'abort', record.abortListener);
      }
    };

    EventTarget.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ): void {
      if (!listener || (typeof options === 'object' && options.signal?.aborted)) {
        originalAddEventListener.call(this, type, listener, options);
        return;
      }

      const capture = captureOf(options);
      const existing = [...listenerRecords].find(
        (record) =>
          record.target === this &&
          record.type === type &&
          record.listener === listener &&
          record.capture === capture,
      );

      if (existing) {
        originalAddEventListener.call(this, type, existing.nativeListener, options);
        return;
      }

      const once = typeof options === 'object' && Boolean(options.once);
      const signal = typeof options === 'object' ? options.signal : undefined;
      const record: TrackedListener = {
        target: this,
        type,
        listener,
        nativeListener: listener,
        capture,
        once,
        ...(options === undefined ? {} : { options }),
        ...(signal === undefined ? {} : { signal }),
      };

      if (once) {
        record.nativeListener = function (this: EventTarget, event: Event) {
          removeRecord(record, false);
          if (typeof listener === 'function') {
            listener.call(this, event);
          } else {
            listener.handleEvent(event);
          }
        };
      }

      listenerRecords.add(record);
      try {
        originalAddEventListener.call(this, type, record.nativeListener, options);
      } catch (error) {
        listenerRecords.delete(record);
        throw error;
      }

      if (signal) {
        const abortListener = () => removeRecord(record, false);
        record.abortListener = abortListener;
        originalAddEventListener.call(signal, 'abort', abortListener, { once: true });
      }
    };

    EventTarget.prototype.removeEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ): void {
      const capture = captureOf(options);
      const record = [...listenerRecords].find(
        (candidate) =>
          candidate.target === this &&
          candidate.type === type &&
          candidate.listener === listener &&
          candidate.capture === capture,
      );

      if (record) {
        removeRecord(record, true);
        return;
      }

      originalRemoveEventListener.call(this, type, listener, options);
    };

    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (typeof handler !== 'function') {
        return originalSetTimeout(handler, timeout, ...args);
      }

      let timerId = 0;
      const wrappedHandler = (...callbackArgs: unknown[]) => {
        activeTimeouts.delete(timerId);
        handler(...callbackArgs);
      };
      timerId = originalSetTimeout(wrappedHandler, timeout, ...args);
      activeTimeouts.add(timerId);
      return timerId;
    }) as typeof window.setTimeout;

    window.clearTimeout = ((timerId?: number) => {
      if (timerId !== undefined) {
        activeTimeouts.delete(timerId);
      }
      originalClearTimeout(timerId);
    }) as typeof window.clearTimeout;

    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const timerId = originalSetInterval(handler, timeout, ...args);
      activeIntervals.add(timerId);
      return timerId;
    }) as typeof window.setInterval;

    window.clearInterval = ((timerId?: number) => {
      if (timerId !== undefined) {
        activeIntervals.delete(timerId);
      }
      originalClearInterval(timerId);
    }) as typeof window.clearInterval;

    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      let frameId = 0;
      frameId = originalRequestAnimationFrame.call(window, (timestamp) => {
        activeAnimationFrames.delete(frameId);
        callback(timestamp);
      });
      activeAnimationFrames.add(frameId);
      return frameId;
    }) as typeof window.requestAnimationFrame;

    window.cancelAnimationFrame = ((frameId: number) => {
      activeAnimationFrames.delete(frameId);
      originalCancelAnimationFrame.call(window, frameId);
    }) as typeof window.cancelAnimationFrame;

    const sample = (): RuntimeResourceProbeSample => {
      let windowListeners = 0;
      let documentListeners = 0;
      let otherListeners = 0;
      const listenerDetails: Record<string, number> = {};

      for (const record of [...listenerRecords]) {
        // 분리된 DOM 노드는 프로브의 강한 참조 때문에 GC가 막히므로 전역 잔존 집계에서 제외한다.
        if (record.target instanceof Node && !record.target.isConnected) {
          removeRecord(record, false);
          continue;
        }

        const targetName =
          record.target === window
            ? 'Window'
            : record.target === document
              ? 'Document'
              : record.target.constructor.name;
        const detailKey = `${targetName}:${record.type}`;
        listenerDetails[detailKey] = (listenerDetails[detailKey] ?? 0) + 1;
        if (record.target === window) {
          windowListeners += 1;
        } else if (record.target === document) {
          documentListeners += 1;
        } else {
          otherListeners += 1;
        }
      }

      const timeouts = activeTimeouts.size;
      const intervals = activeIntervals.size;
      const animationFrames = activeAnimationFrames.size;
      return {
        listenerCount: windowListeners + documentListeners + otherListeners,
        timerCount: timeouts + intervals + animationFrames,
        windowListeners,
        documentListeners,
        otherListeners,
        timeouts,
        intervals,
        animationFrames,
        listenerDetails,
      };
    };

    instrumentedWindow.__WGM_RUNTIME_RESOURCE_PROBE__ = {
      sample,
      restore: () => {
        for (const record of [...listenerRecords]) {
          if (record.once) {
            removeRecord(record, true);
            if (!record.signal?.aborted) {
              originalAddEventListener.call(
                record.target,
                record.type,
                record.listener,
                record.options,
              );
            }
          } else {
            removeRecord(record, false);
          }
        }

        EventTarget.prototype.addEventListener = originalAddEventListener;
        EventTarget.prototype.removeEventListener = originalRemoveEventListener;
        window.setTimeout = originalSetTimeoutReference;
        window.clearTimeout = originalClearTimeoutReference;
        window.setInterval = originalSetIntervalReference;
        window.clearInterval = originalClearIntervalReference;
        window.requestAnimationFrame = originalRequestAnimationFrame;
        window.cancelAnimationFrame = originalCancelAnimationFrame;
        activeTimeouts.clear();
        activeIntervals.clear();
        activeAnimationFrames.clear();
        delete instrumentedWindow.__WGM_RUNTIME_RESOURCE_PROBE__;
      },
    };
  });
}

test.describe('Phaser 4.2.1 호환성 @smoke', () => {
  test('자산·물리·입력·카메라와 3회 재생성 정리를 검증한다', async ({ page }) => {
    await installRuntimeResourceProbe(page);
    await page.goto('./?view=compat');
    expect(new URL(page.url()).pathname).toBe('/phase-0/nested/');
    await page.waitForFunction(
      () =>
        (window as Window & { __WGM_PLAYER_TEST__?: PlayerTestApi })
          .__WGM_PLAYER_TEST__?.snapshot().phase === 'ready',
    );

    const gameHost = page.getByTestId('game-host');
    await expect(gameHost.locator('canvas')).toHaveCount(1);

    const initialResourceBaseline = await page.evaluate(() => {
      const probe = (window as InstrumentedWindow).__WGM_RUNTIME_RESOURCE_PROBE__;
      if (!probe) {
        throw new Error('런타임 자원 프로브를 찾을 수 없습니다.');
      }
      return probe.sample();
    });

    const initial = await page.evaluate(() =>
      (window as Window & { __WGM_PLAYER_TEST__?: PlayerTestApi })
        .__WGM_PLAYER_TEST__?.snapshot(),
    );
    expect(initial).toMatchObject({
      phase: 'ready',
      generation: 1,
      createCount: 1,
      destroyCount: 0,
      assets: { png: true, svg: true },
      systems: { physics: true, collision: true, keyboard: true, camera: true },
      resources: {
        canvasCount: 1,
        orphanCanvases: 0,
        orphanListeners: 0,
        orphanTimers: 0,
      },
    });

    if (!initial?.probe) {
      throw new Error('실제 Phaser 상태를 읽는 test bridge probe가 준비되지 않았습니다.');
    }

    const initialProbe = initial.probe;
    expect(initialProbe.assets.png).toMatchObject({
      sourceWidth: 1,
      sourceHeight: 1,
      displayWidth: 52,
      displayHeight: 52,
    });
    expect(initialProbe.assets.png.scaleX).toBeCloseTo(52, 5);
    expect(initialProbe.assets.png.scaleY).toBeCloseTo(52, 5);
    expect(initialProbe.assets.svg).toMatchObject({
      sourceWidth: 64,
      sourceHeight: 64,
      displayWidth: 56,
      displayHeight: 56,
    });
    expect(initialProbe.assets.svg.scaleX).toBeCloseTo(0.875, 5);
    expect(initialProbe.assets.svg.scaleY).toBeCloseTo(0.875, 5);
    expect(initialProbe.barrier).toMatchObject({
      displayWidth: 190,
      displayHeight: 26,
    });
    expect(initialProbe.camera.zoom).toBeCloseTo(1.04, 5);

    const productionAssetPaths = await page.evaluate(() =>
      [...document.scripts]
        .map((script) => script.src)
        .filter(Boolean)
        .map((source) => new URL(source).pathname),
    );
    expect(productionAssetPaths).toEqual([
      expect.stringMatching(/^\/phase-0\/nested\/assets\//),
    ]);

    await page.keyboard.down('ArrowRight');
    const collisionProbe = await (async (): Promise<RuntimeProbeSnapshot | null> => {
      try {
        await page.waitForFunction(
          () => {
            const probe = (window as InstrumentedWindow).__WGM_PLAYER_TEST__?.snapshot().probe;
            return Boolean(probe && probe.collision.count > 0);
          },
          undefined,
          { timeout: 5_000 },
        );
        return await page.evaluate(
          () => (window as InstrumentedWindow).__WGM_PLAYER_TEST__?.snapshot().probe ?? null,
        );
      } finally {
        await page.keyboard.up('ArrowRight');
      }
    })();

    if (!collisionProbe) {
      throw new Error('키 입력 뒤 Arcade barrier 충돌 상태를 관측하지 못했습니다.');
    }

    expect(collisionProbe.player.x).toBeGreaterThan(initialProbe.player.x + 75);
    expect(collisionProbe.player.y).toBeCloseTo(initialProbe.player.y, 1);
    expect(collisionProbe.camera.scrollX).toBeGreaterThan(initialProbe.camera.scrollX + 40);
    expect(collisionProbe.collision.count).toBeGreaterThan(0);
    expect(
      collisionProbe.collision.blockedRight || collisionProbe.collision.touchingRight,
    ).toBe(true);
    expect(collisionProbe.player.x + collisionProbe.player.displayWidth / 2).toBeLessThanOrEqual(
      collisionProbe.barrier.left + 1,
    );

    const recreateCycles = await page.evaluate(async () => {
      const instrumentedWindow = window as InstrumentedWindow;
      const api = instrumentedWindow.__WGM_PLAYER_TEST__;
      const probe = instrumentedWindow.__WGM_RUNTIME_RESOURCE_PROBE__;
      if (!api || !probe) {
        throw new Error('player 테스트 브리지 또는 런타임 자원 프로브를 찾을 수 없습니다.');
      }

      const cycles: Array<{
        snapshot: CompatibilitySnapshot;
        resources: RuntimeResourceProbeSample;
      }> = [];
      for (let cycle = 0; cycle < 3; cycle += 1) {
        const snapshot = await api.recreate(1);
        cycles.push({ snapshot, resources: probe.sample() });
      }
      return cycles;
    });

    for (const [index, cycle] of recreateCycles.entries()) {
      expect(cycle.resources, `재생성 ${index + 1}회 전역 자원 기준선`).toEqual(
        initialResourceBaseline,
      );
      expect(cycle.snapshot.resources).toMatchObject({
        canvasCount: 1,
        orphanCanvases: 0,
        orphanListeners: 0,
        orphanTimers: 0,
      });
    }

    expect(recreateCycles.at(-1)?.snapshot).toMatchObject({
      phase: 'ready',
      generation: 4,
      createCount: 4,
      destroyCount: 3,
      completedRecreateCycles: 1,
      resources: {
        canvasCount: 1,
        orphanCanvases: 0,
        orphanListeners: 0,
        orphanTimers: 0,
      },
    });
    await expect(gameHost.locator('canvas')).toHaveCount(1);

    const cleanup = await page.evaluate(async () => {
      const instrumentedWindow = window as InstrumentedWindow;
      const api = instrumentedWindow.__WGM_PLAYER_TEST__;
      const probe = instrumentedWindow.__WGM_RUNTIME_RESOURCE_PROBE__;
      if (!api || !probe) {
        throw new Error('정리할 테스트 브리지 또는 런타임 자원 프로브를 찾을 수 없습니다.');
      }

      const snapshot = await api.destroy();
      const resourcesBeforeRestore = probe.sample();
      const patchedAddEventListener = EventTarget.prototype.addEventListener;
      const patchedSetTimeout = window.setTimeout;
      const patchedRequestAnimationFrame = window.requestAnimationFrame;
      probe.restore();
      return {
        snapshot,
        resourcesBeforeRestore,
        probeRestored: instrumentedWindow.__WGM_RUNTIME_RESOURCE_PROBE__ === undefined,
        eventTargetApiRestored: EventTarget.prototype.addEventListener !== patchedAddEventListener,
        timerApiRestored: window.setTimeout !== patchedSetTimeout,
        animationFrameApiRestored:
          window.requestAnimationFrame !== patchedRequestAnimationFrame,
      };
    });

    expect(cleanup.snapshot.resources).toMatchObject({
      canvasCount: 0,
      activeListeners: 0,
      activeTimers: 0,
      orphanCanvases: 0,
      orphanListeners: 0,
      orphanTimers: 0,
    });
    expect(cleanup.resourcesBeforeRestore.listenerCount).toBeGreaterThan(0);
    expect(cleanup.probeRestored).toBe(true);
    expect(cleanup.eventTargetApiRestored).toBe(true);
    expect(cleanup.timerApiRestored).toBe(true);
    expect(cleanup.animationFrameApiRestored).toBe(true);
    await expect(gameHost.locator('canvas')).toHaveCount(0);
  });

  test('sandbox iframe의 ready와 ping/pong 왕복을 검증한다', async ({ page }) => {
    await page.goto('./?view=compat');
    expect(new URL(page.url()).pathname).toBe('/phase-0/nested/');

    const bridgeResult = await page.evaluate(async () => {
      const channel = 'web-game-maker/player';
      const requestId = `e2e-${Date.now()}`;

      return new Promise<{
        ready: boolean;
        pong: boolean;
        requestId: string;
        childCanAccessParentDom: boolean;
        parentCanAccessFrameDom: boolean;
        childOrigin: string;
        framePathname: string;
      }>((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.title = 'player compatibility frame';
        iframe.sandbox.add('allow-scripts');
        iframe.style.cssText =
          'position:fixed;left:-2000px;top:0;width:480px;height:270px;border:0;';
        let childCanAccessParentDom: boolean | null = null;

        const timeoutId = window.setTimeout(() => {
          const frameDetails = {
            attached: iframe.isConnected,
            src: iframe.src,
          };
          cleanup();
          reject(
            new Error(`iframe 브리지 응답 시간이 초과되었습니다: ${JSON.stringify(frameDetails)}`),
          );
        }, 15_000);

        const cleanup = () => {
          window.clearTimeout(timeoutId);
          window.removeEventListener('message', onMessage);
          iframe.remove();
        };

        const onMessage = (event: MessageEvent<unknown>) => {
          if (event.origin !== 'null' || event.source !== iframe.contentWindow) {
            return;
          }

          if (!event.data || typeof event.data !== 'object') {
            return;
          }

          const message = event.data as {
            channel?: string;
            version?: number;
            type?: string;
            requestId?: string;
            generation?: number;
            parentDomAccessible?: boolean;
          };

          if (message.channel !== channel || message.version !== 1) {
            return;
          }

          if (message.type === 'ready') {
            if (
              typeof message.generation !== 'number' ||
              typeof message.parentDomAccessible !== 'boolean'
            ) {
              return;
            }

            childCanAccessParentDom = message.parentDomAccessible;
            iframe.contentWindow?.postMessage(
              { channel, version: 1, type: 'ping', requestId },
              '*',
            );
          }

          if (
            message.type === 'pong' &&
            message.requestId === requestId &&
            typeof message.generation === 'number' &&
            childCanAccessParentDom !== null
          ) {
            let parentCanAccessFrameDom = true;
            try {
              void iframe.contentWindow?.document.documentElement;
            } catch {
              parentCanAccessFrameDom = false;
            }

            cleanup();
            resolve({
              ready: true,
              pong: true,
              requestId,
              childCanAccessParentDom,
              parentCanAccessFrameDom,
              childOrigin: event.origin,
              framePathname: new URL(iframe.src).pathname,
            });
          }
        };

        window.addEventListener('message', onMessage);
        const frameUrl = new URL(window.location.href);
        frameUrl.searchParams.set('embedded', '1');
        frameUrl.searchParams.set('parentOrigin', window.location.origin);
        iframe.src = frameUrl.toString();
        document.body.append(iframe);
      });
    });

    expect(bridgeResult).toEqual({
      ready: true,
      pong: true,
      requestId: expect.stringMatching(/^e2e-/),
      childCanAccessParentDom: false,
      parentCanAccessFrameDom: false,
      childOrigin: 'null',
      framePathname: '/phase-0/nested/',
    });
  });
});
