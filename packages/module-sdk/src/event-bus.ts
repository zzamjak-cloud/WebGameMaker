import type { ModuleEvent, ModuleEventBus } from "./types.js";

/** 모듈 간 느슨한 통신용 인메모리 이벤트 버스 */
export function createEventBus(): ModuleEventBus {
  const listeners = new Map<string, Set<(event: ModuleEvent) => void>>();

  return {
    emit(event) {
      const handlers = listeners.get(event.type);
      if (!handlers) {
        return;
      }
      for (const handler of [...handlers]) {
        handler(event);
      }
    },
    on(type, handler) {
      const bucket = listeners.get(type) ?? new Set();
      bucket.add(handler);
      listeners.set(type, bucket);
      return () => {
        bucket.delete(handler);
        if (bucket.size === 0) {
          listeners.delete(type);
        }
      };
    },
    clear() {
      listeners.clear();
    },
  };
}
