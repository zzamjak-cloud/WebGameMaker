/** 모듈이 요청할 수 있는 런타임 capability 이름 */
export type ModuleCapability =
  | "input"
  | "clock"
  | "random"
  | "eventBus"
  | "assets"
  | "physics";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface ModuleEvent<TPayload = unknown> {
  type: string;
  payload: TPayload;
}

export interface ModuleEventBus {
  emit(event: ModuleEvent): void;
  on(type: string, handler: (event: ModuleEvent) => void): () => void;
  clear(): void;
}

export interface ModuleClock {
  nowMs(): number;
}

export interface ModuleRandom {
  next(): number;
}

export interface ModuleInputSnapshot {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  action: boolean;
}

export interface ModuleInput {
  snapshot(): ModuleInputSnapshot;
}

export interface ModuleContext {
  entityId: string;
  capabilities: ReadonlySet<ModuleCapability>;
  eventBus: ModuleEventBus;
  clock: ModuleClock;
  random?: ModuleRandom;
  input?: ModuleInput;
}

export interface ModuleInstance {
  start(): void;
  update(deltaMs: number): void;
  handle(event: ModuleEvent): void;
  destroy(): void;
}

export interface ModuleDefinition<TConfig = unknown> {
  id: string;
  version: string;
  requiredCapabilities: readonly ModuleCapability[];
  parseConfig(value: unknown): TConfig;
  setup(context: ModuleContext, config: TConfig): ModuleInstance;
}

export class ModuleCapabilityError extends Error {
  constructor(moduleId: string, missing: readonly ModuleCapability[]) {
    super(
      `모듈 ${moduleId}에 필요한 capability가 없습니다: ${missing.join(", ")}`,
    );
    this.name = "ModuleCapabilityError";
  }
}

export function assertCapabilities(
  moduleId: string,
  required: readonly ModuleCapability[],
  available: ReadonlySet<ModuleCapability>,
): void {
  const missing = required.filter((item) => !available.has(item));
  if (missing.length > 0) {
    throw new ModuleCapabilityError(moduleId, missing);
  }
}
