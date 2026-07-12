import Phaser from 'phaser';

interface GlobalResourceProbeSample {
  listenerCount: number;
  timerCount: number;
}

interface GlobalResourceProbe {
  sample: () => GlobalResourceProbeSample;
}

export interface RuntimeResourceCounts {
  listeners: number;
  timers: number;
}

function getGlobalResourceProbe(): GlobalResourceProbe | null {
  const probe = (
    window as Window & {
      __WGM_RUNTIME_RESOURCE_PROBE__?: GlobalResourceProbe;
    }
  ).__WGM_RUNTIME_RESOURCE_PROBE__;

  return probe && typeof probe.sample === 'function' ? probe : null;
}

export class RuntimeResourceLedger {
  private listenerDisposers = new Set<() => void>();
  private timerIds = new Set<number>();

  get activeListeners(): number {
    return this.listenerDisposers.size;
  }

  get activeTimers(): number {
    return this.timerIds.size;
  }

  listen(type: string, listener: EventListener): void {
    window.addEventListener(type, listener);
    this.listenerDisposers.add(() => window.removeEventListener(type, listener));
  }

  interval(callback: () => void, delay: number): void {
    const id = window.setInterval(callback, delay);
    this.timerIds.add(id);
  }

  dispose(): void {
    for (const disposeListener of this.listenerDisposers) {
      disposeListener();
    }
    this.listenerDisposers.clear();

    for (const timerId of this.timerIds) {
      window.clearInterval(timerId);
    }
    this.timerIds.clear();
  }
}

export class RuntimeResourceMonitor {
  private readonly probe = getGlobalResourceProbe();
  private readonly baseline = this.probe?.sample() ?? null;

  measure(resources: RuntimeResourceLedger | null): RuntimeResourceCounts {
    if (!this.probe || !this.baseline) {
      return {
        listeners: resources?.activeListeners ?? 0,
        timers: resources?.activeTimers ?? 0,
      };
    }

    const current = this.probe.sample();
    return {
      listeners: Math.max(0, current.listenerCount - this.baseline.listenerCount),
      timers: Math.max(0, current.timerCount - this.baseline.timerCount),
    };
  }
}

export class PhaserGlobalDomResources {
  private captureActive = false;
  private readonly previousDocumentAddDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'addEventListener',
  );
  private readonly previousWindowBlur = window.onblur;
  private readonly previousWindowFocus = window.onfocus;
  private readonly visibilityListeners: Array<{
    type: string;
    listener: EventListenerOrEventListenerObject;
    options?: boolean | AddEventListenerOptions;
  }> = [];

  beginCapture(): void {
    if (this.captureActive) {
      return;
    }

    this.captureActive = true;
    const currentAddEventListener = document.addEventListener;
    document.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (!listener) {
        return;
      }

      if (type.endsWith('visibilitychange')) {
        this.visibilityListeners.push({
          type,
          listener,
          ...(options === undefined ? {} : { options }),
        });
      }
      currentAddEventListener.call(document, type, listener, options);
    }) as typeof document.addEventListener;
  }

  endCapture(): void {
    if (!this.captureActive) {
      return;
    }

    if (this.previousDocumentAddDescriptor) {
      Object.defineProperty(document, 'addEventListener', this.previousDocumentAddDescriptor);
    } else {
      Reflect.deleteProperty(document, 'addEventListener');
    }
    this.captureActive = false;
  }

  dispose(): void {
    this.endCapture();
    for (const { type, listener, options } of this.visibilityListeners) {
      document.removeEventListener(type, listener, options);
    }
    this.visibilityListeners.length = 0;
    window.onblur = this.previousWindowBlur;
    window.onfocus = this.previousWindowFocus;
  }
}

export async function destroyPhaserGame(
  game: Phaser.Game,
  domResources: PhaserGlobalDomResources | null,
): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    let timeoutId = 0;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      game.events.off(Phaser.Core.Events.DESTROY, finish);
      resolve();
    };

    game.events.once(Phaser.Core.Events.DESTROY, finish);
    timeoutId = window.setTimeout(finish, 1_000);
    game.destroy(true, false);
  });

  // Phaser의 destroy 후속 정리가 현재 task를 벗어날 수 있어 다음 task에서 잔존을 측정한다.
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  // Phaser 4.2.1이 회수하지 않는 visibility/window handler는 인스턴스 소유 범위에서 복구한다.
  domResources?.dispose();
}
