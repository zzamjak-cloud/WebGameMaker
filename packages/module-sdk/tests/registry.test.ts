import { describe, expect, it, vi } from "vitest";

import {
  createEventBus,
  createModuleRegistry,
  ModuleCapabilityError,
  ModuleRegistryError,
  type ModuleDefinition,
  type ModuleInstance,
} from "../src/index.js";

function createNoopInstance(): ModuleInstance {
  return {
    start() {},
    update() {},
    handle() {},
    destroy() {},
  };
}

const sampleModule: ModuleDefinition<{ speed: number }> = {
  id: "module.player-move-2d",
  version: "1.0.0",
  requiredCapabilities: ["input", "clock"],
  parseConfig(value) {
    if (
      typeof value !== "object" ||
      value === null ||
      !("speed" in value) ||
      typeof value.speed !== "number"
    ) {
      throw new Error("speed 설정이 필요합니다.");
    }
    return { speed: value.speed };
  },
  setup() {
    return createNoopInstance();
  },
};

describe("ModuleRegistry", () => {
  it("허용 목록에 없는 모듈 ID를 거부한다", () => {
    const registry = createModuleRegistry([sampleModule]);
    expect(() => registry.get("module.unknown")).toThrow(ModuleRegistryError);
  });

  it("중복 등록을 거부한다", () => {
    const registry = createModuleRegistry([sampleModule]);
    expect(() => registry.register(sampleModule)).toThrow(ModuleRegistryError);
  });

  it("필요한 capability가 없으면 인스턴스 생성을 거부한다", () => {
    const registry = createModuleRegistry([sampleModule]);
    expect(() =>
      registry.createInstance(
        "module.player-move-2d",
        {
          entityId: "entity.player",
          capabilities: new Set(["clock"]),
          eventBus: createEventBus(),
          clock: { nowMs: () => 0 },
        },
        { speed: 120 },
      ),
    ).toThrow(ModuleCapabilityError);
  });

  it("destroy 시 이벤트 리스너를 정리할 수 있다", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on("damage", handler);
    bus.emit({ type: "damage", payload: 1 });
    expect(handler).toHaveBeenCalledOnce();
    unsubscribe();
    bus.emit({ type: "damage", payload: 2 });
    expect(handler).toHaveBeenCalledOnce();
    bus.clear();
  });
});
