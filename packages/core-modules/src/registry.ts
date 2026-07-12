import {
  createModuleRegistry,
  type ModuleRegistry,
} from "@web-game-maker/module-sdk";

import { P0_MODULE_DEFINITIONS } from "./definitions.js";

export function createCoreModuleRegistry(): ModuleRegistry {
  return createModuleRegistry([...P0_MODULE_DEFINITIONS]);
}

export const CORE_MODULE_IDS = P0_MODULE_DEFINITIONS.map((item) => item.id);
