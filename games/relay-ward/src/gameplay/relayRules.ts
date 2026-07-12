import {
  integratePlayerPosition,
  resolveContactDamage,
  resolvePlayerMovement,
  stepEnemyAi,
  type EnemyAiConfig,
  type EnemyAiState,
  type Facing,
  type MovementBounds,
  type MovementInput,
  type Position,
} from "@web-game-maker/core-modules";

export interface RelayEnemy extends EnemyAiState {
  id: string;
  contact: { damage: number; cooldownMs: number };
  ai: EnemyAiConfig;
}

export interface RelayNode {
  id: string;
  order: number;
  synced: boolean;
}

export interface RelayRulesConfig {
  bounds: MovementBounds;
  player: {
    position: Position;
    facing: Facing;
    speed: number;
    health: number;
    maximumHealth: number;
  };
  enemies: readonly RelayEnemy[];
  nodes: readonly Omit<RelayNode, "synced">[];
}

export interface RelayState {
  phase: "playing" | "won" | "lost";
  player: RelayRulesConfig["player"] & { invulnerableUntil: number };
  enemies: readonly RelayEnemy[];
  nodes: readonly RelayNode[];
  nextOrder: number;
}

export function createRelayState(config: RelayRulesConfig): RelayState {
  return {
    phase: "playing",
    player: { ...config.player, invulnerableUntil: 0 },
    enemies: config.enemies.map((enemy) => ({
      ...enemy,
      position: { ...enemy.position },
      patrolOrigin: { ...enemy.patrolOrigin },
    })),
    nodes: config.nodes
      .map((node) => ({ ...node, synced: false }))
      .sort((left, right) => left.order - right.order),
    nextOrder: 1,
  };
}

export function moveRelayPlayer(
  state: RelayState,
  input: MovementInput,
  deltaMs: number,
  bounds: MovementBounds,
): RelayState {
  if (state.phase !== "playing") {
    return state;
  }
  const intent = resolvePlayerMovement(input, state.player.speed, state.player.facing);
  return {
    ...state,
    player: {
      ...state.player,
      position: integratePlayerPosition(
        state.player.position,
        intent.velocity,
        deltaMs,
        bounds,
      ),
      facing: intent.facing,
    },
  };
}

export function stepRelayEnemies(
  state: RelayState,
  deltaMs: number,
): RelayState {
  if (state.phase !== "playing") {
    return state;
  }
  return {
    ...state,
    enemies: state.enemies.map((enemy) =>
      stepEnemyAi(enemy, state.player.position, enemy.ai, deltaMs),
    ),
  };
}

export function applyRelayContact(
  state: RelayState,
  enemyId: string,
  nowMs: number,
): RelayState {
  if (state.phase !== "playing") {
    return state;
  }
  const enemy = state.enemies.find((candidate) => candidate.id === enemyId);
  if (!enemy) {
    throw new Error(`relay enemy를 찾을 수 없습니다: ${enemyId}`);
  }
  const hit = resolveContactDamage({
    health: state.player.health,
    maximumHealth: state.player.maximumHealth,
    invulnerableUntil: state.player.invulnerableUntil,
    damage: enemy.contact.damage,
    nowMs,
    invulnerabilityMs: enemy.contact.cooldownMs,
  });
  if (!hit) {
    return state;
  }
  return {
    ...state,
    phase: hit.depleted ? "lost" : "playing",
    player: {
      ...state.player,
      health: hit.health,
      invulnerableUntil: hit.invulnerableUntil,
    },
  };
}

export function syncRelayNode(state: RelayState, nodeId: string): RelayState {
  if (state.phase !== "playing") {
    return state;
  }
  const node = state.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`relay node를 찾을 수 없습니다: ${nodeId}`);
  }
  if (node.synced || node.order !== state.nextOrder) {
    return state;
  }
  const nodes = state.nodes.map((candidate) =>
    candidate.id === nodeId ? { ...candidate, synced: true } : candidate,
  );
  const nextOrder = state.nextOrder + 1;
  return {
    ...state,
    nodes,
    nextOrder,
    phase: nodes.every((candidate) => candidate.synced) ? "won" : "playing",
  };
}
