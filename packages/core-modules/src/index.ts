export {
  applyHealthDamage,
  applyHealthHeal,
  clampHealth,
} from "./health.js";
export {
  resolveContactDamage,
  type ContactDamageResult,
} from "./damage-contact.js";
export {
  resolveEnemyMode,
  stepEnemyAi,
  stepEnemyChase,
  stepEnemyPatrol,
} from "./enemy-ai.js";
export {
  integratePlayerPosition,
  resolvePlayerMovement,
} from "./player-move-2d.js";
export {
  P0_MODULE_DEFINITIONS,
  cameraFollowDefinition,
  collisionLayerDefinition,
  damageContactDefinition,
  enemyChaseDefinition,
  enemyPatrolDefinition,
  healthDefinition,
  playerMove2dDefinition,
  sceneTransitionDefinition,
} from "./definitions.js";
export {
  CORE_MODULE_IDS,
  createCoreModuleRegistry,
} from "./registry.js";
export {
  assertNonNegativeFinite,
  distanceBetween,
  type ChaseConfig,
  type EnemyAiConfig,
  type EnemyAiState,
  type EnemyMode,
  type Facing,
  type MovementBounds,
  type MovementInput,
  type MovementIntent,
  type PatrolConfig,
  type Position,
} from "./shared.js";
