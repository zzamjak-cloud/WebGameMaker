import {
  createCoreModuleRegistry,
  CORE_MODULE_IDS,
} from "@web-game-maker/core-modules";
import {
  createEventBus,
  type ModuleCapability,
  type ModuleInstance,
  type ModuleRegistry,
} from "@web-game-maker/module-sdk";
import type { ModuleBinding, ProjectBundle } from "@web-game-maker/schema";

export interface BoundModule {
  bindingId: string;
  moduleId: string;
  entityId: string;
  instance: ModuleInstance;
}

export interface ModuleHost {
  registry: ModuleRegistry;
  bindings: readonly BoundModule[];
  start(): void;
  update(deltaMs: number): void;
  destroy(): void;
}

const DEFAULT_CAPABILITIES: ModuleCapability[] = [
  "input",
  "clock",
  "random",
  "eventBus",
  "assets",
  "physics",
];

/** 장면 바인딩을 allowlist 레지스트리로 조립한다. 게임 전용 모듈은 건너뛴다. */
export function createModuleHost(
  bundle: ProjectBundle,
  options?: {
    registry?: ModuleRegistry;
    knownGameModuleIds?: ReadonlySet<string>;
    nowMs?: () => number;
  },
): ModuleHost {
  const registry = options?.registry ?? createCoreModuleRegistry();
  const knownGameModuleIds = options?.knownGameModuleIds ?? new Set<string>();
  const eventBus = createEventBus();
  const capabilities = new Set<ModuleCapability>(DEFAULT_CAPABILITIES);
  const clock = { nowMs: options?.nowMs ?? (() => 0) };
  const bindings: BoundModule[] = [];

  for (const scene of bundle.scenes) {
    for (const entity of scene.entities) {
      for (const binding of entity.modules) {
        if (!binding.enabled) {
          continue;
        }
        if (!registry.has(binding.moduleId)) {
          if (knownGameModuleIds.has(binding.moduleId)) {
            continue;
          }
          throw new Error(
            `허용되지 않은 모듈 바인딩입니다: ${binding.moduleId}`,
          );
        }
        const instance = registry.createInstance(
          binding.moduleId,
          {
            entityId: entity.id,
            capabilities,
            eventBus,
            clock,
          },
          binding.config,
        );
        bindings.push({
          bindingId: binding.id,
          moduleId: binding.moduleId,
          entityId: entity.id,
          instance,
        });
      }
    }
  }

  return {
    registry,
    bindings,
    start() {
      for (const binding of bindings) {
        binding.instance.start();
      }
    },
    update(deltaMs) {
      for (const binding of bindings) {
        binding.instance.update(deltaMs);
      }
    },
    destroy() {
      for (const binding of [...bindings].reverse()) {
        binding.instance.destroy();
      }
      eventBus.clear();
    },
  };
}

export function collectBoundModuleIds(bindings: readonly ModuleBinding[]): string[] {
  return [...new Set(bindings.map((binding) => binding.moduleId))].sort();
}

export { CORE_MODULE_IDS };
