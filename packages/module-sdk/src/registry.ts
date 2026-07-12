import {
  assertCapabilities,
  type ModuleContext,
  type ModuleDefinition,
  type ModuleInstance,
} from "./types.js";

export class ModuleRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleRegistryError";
  }
}

/** build-time allowlist 기반 모듈 레지스트리. 임의 URL/eval 로딩은 금지한다. */
export class ModuleRegistry {
  private readonly definitions = new Map<string, ModuleDefinition<unknown>>();

  register(definition: ModuleDefinition<unknown>): void {
    if (this.definitions.has(definition.id)) {
      throw new ModuleRegistryError(
        `모듈 ID가 이미 등록되어 있습니다: ${definition.id}`,
      );
    }
    this.definitions.set(definition.id, definition);
  }

  has(moduleId: string): boolean {
    return this.definitions.has(moduleId);
  }

  get(moduleId: string): ModuleDefinition<unknown> {
    const definition = this.definitions.get(moduleId);
    if (!definition) {
      throw new ModuleRegistryError(`허용되지 않은 모듈 ID입니다: ${moduleId}`);
    }
    return definition;
  }

  listIds(): string[] {
    return [...this.definitions.keys()].sort();
  }

  createInstance(
    moduleId: string,
    context: ModuleContext,
    configValue: unknown,
  ): ModuleInstance {
    const definition = this.get(moduleId);
    assertCapabilities(
      moduleId,
      definition.requiredCapabilities,
      context.capabilities,
    );
    const config = definition.parseConfig(configValue);
    return definition.setup(context, config);
  }
}

export function createModuleRegistry(
  definitions: readonly ModuleDefinition<unknown>[] = [],
): ModuleRegistry {
  const registry = new ModuleRegistry();
  for (const definition of definitions) {
    registry.register(definition);
  }
  return registry;
}
