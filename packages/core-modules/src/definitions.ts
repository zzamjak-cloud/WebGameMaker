import type { ModuleDefinition, ModuleInstance } from "@web-game-maker/module-sdk";

function noopInstance(): ModuleInstance {
  return {
    start() {},
    update() {},
    handle() {},
    destroy() {},
  };
}

function requireNumberRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, number> {
  if (typeof value !== "object" || value === null) {
    throw new Error("모듈 config는 객체여야 합니다.");
  }
  const record = value as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const key of keys) {
    const item = record[key];
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new Error(`${key}는 유한한 숫자여야 합니다.`);
    }
    result[key] = item;
  }
  return result;
}

export const playerMove2dDefinition: ModuleDefinition<{ speed: number }> = {
  id: "module.player-move-2d",
  version: "1.0.0",
  requiredCapabilities: ["input", "clock"],
  parseConfig(value) {
    const config = requireNumberRecord(value, ["speed"]);
    return { speed: config.speed! };
  },
  setup() {
    return noopInstance();
  },
};

export const healthDefinition: ModuleDefinition<{
  maximum: number;
  current: number;
}> = {
  id: "module.health",
  version: "1.0.0",
  requiredCapabilities: ["eventBus"],
  parseConfig(value) {
    const config = requireNumberRecord(value, ["maximum", "current"]);
    return { maximum: config.maximum!, current: config.current! };
  },
  setup() {
    return noopInstance();
  },
};

export const enemyPatrolDefinition: ModuleDefinition<Record<string, number | string>> =
  {
    id: "module.enemy-patrol",
    version: "1.0.0",
    requiredCapabilities: ["clock"],
    parseConfig(value) {
      if (typeof value !== "object" || value === null) {
        throw new Error("patrol config는 객체여야 합니다.");
      }
      return value as Record<string, number | string>;
    },
    setup() {
      return noopInstance();
    },
  };

export const enemyChaseDefinition: ModuleDefinition<Record<string, number>> = {
  id: "module.enemy-chase",
  version: "1.0.0",
  requiredCapabilities: ["clock"],
  parseConfig(value) {
    return requireNumberRecord(value, [
      "detectionDistance",
      "disengageDistance",
      "speed",
      "stopDistance",
    ]);
  },
  setup() {
    return noopInstance();
  },
};

export const damageContactDefinition: ModuleDefinition<{
  damage: number;
  cooldownMs: number;
}> = {
  id: "module.damage-contact",
  version: "1.0.0",
  requiredCapabilities: ["clock", "eventBus"],
  parseConfig(value) {
    const config = requireNumberRecord(value, ["damage", "cooldownMs"]);
    return {
      damage: config.damage!,
      cooldownMs: config.cooldownMs!,
    };
  },
  setup() {
    return noopInstance();
  },
};

export const cameraFollowDefinition: ModuleDefinition<Record<string, unknown>> =
  {
    id: "module.camera-follow",
    version: "1.0.0",
    requiredCapabilities: ["clock"],
    parseConfig(value) {
      if (typeof value !== "object" || value === null) {
        throw new Error("camera-follow config는 객체여야 합니다.");
      }
      return value as Record<string, unknown>;
    },
    setup() {
      return noopInstance();
    },
  };

export const collisionLayerDefinition: ModuleDefinition<Record<string, unknown>> =
  {
    id: "module.collision-layer",
    version: "1.0.0",
    requiredCapabilities: ["physics"],
    parseConfig(value) {
      if (typeof value !== "object" || value === null) {
        throw new Error("collision-layer config는 객체여야 합니다.");
      }
      return value as Record<string, unknown>;
    },
    setup() {
      return noopInstance();
    },
  };

export const sceneTransitionDefinition: ModuleDefinition<Record<string, unknown>> =
  {
    id: "module.scene-transition",
    version: "1.0.0",
    requiredCapabilities: ["eventBus"],
    parseConfig(value) {
      if (typeof value !== "object" || value === null) {
        throw new Error("scene-transition config는 객체여야 합니다.");
      }
      return value as Record<string, unknown>;
    },
    setup() {
      return noopInstance();
    },
  };

export const P0_MODULE_DEFINITIONS = [
  playerMove2dDefinition,
  healthDefinition,
  enemyPatrolDefinition,
  enemyChaseDefinition,
  damageContactDefinition,
  cameraFollowDefinition,
  collisionLayerDefinition,
  sceneTransitionDefinition,
] as const;
