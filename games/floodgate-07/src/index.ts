export {
  compileProject,
  type BeaconConfig,
  type EnemyConfig,
  type FloodgateProjectConfig,
  type HealthConfig,
  type PlayerConfig,
  type Position,
  type SearchlightConfig,
  type ViewportConfig,
} from "./compileProject.js";
export {
  advanceElapsedMs,
  createInitialGameState,
  replaceEnemyState,
  restartGameState,
  updatePlayerPose,
  type EnemyMode,
  type EnemyState,
  type Facing,
  type GamePhase,
  type GameState,
  type LampState,
  type ObjectiveState,
  type PlayerState,
  type RunState,
} from "./gameState.js";
export {
  distanceBetween,
  resolveEnemyMode,
  stepEnemyAi,
} from "./features/enemyAi.js";
export {
  applyContactDamage,
  applySearchlightPulse,
  coolSearchlight,
  findSearchlightTargets,
  type ContactDamageInput,
} from "./features/combat.js";
export {
  integratePlayerPosition,
  resolvePlayerMovement,
  type MovementBounds,
  type MovementInput,
  type MovementIntent,
} from "./features/playerMovement.js";
