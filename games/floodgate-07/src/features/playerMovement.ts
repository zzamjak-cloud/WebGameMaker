import type { Position } from "../compileProject.js";
import type { Facing } from "../gameState.js";

export interface MovementInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface MovementIntent {
  velocity: Position;
  facing: Facing;
}

export interface MovementBounds {
  width: number;
  height: number;
  padding?: number;
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}는 0 이상의 유한한 숫자여야 합니다.`);
  }
}

export function resolvePlayerMovement(
  input: MovementInput,
  speed: number,
  previousFacing: Facing,
): MovementIntent {
  assertNonNegativeFinite(speed, "speed");

  const horizontal = Number(input.right) - Number(input.left);
  const vertical = Number(input.down) - Number(input.up);
  if (horizontal === 0 && vertical === 0) {
    return {
      velocity: { x: 0, y: 0 },
      facing: previousFacing,
    };
  }

  const magnitude = Math.hypot(horizontal, vertical);
  const facing: Facing =
    horizontal < 0
      ? "left"
      : horizontal > 0
        ? "right"
        : vertical < 0
          ? "up"
          : "down";

  return {
    velocity: {
      x: (horizontal / magnitude) * speed,
      y: (vertical / magnitude) * speed,
    },
    facing,
  };
}

export function integratePlayerPosition(
  position: Position,
  velocity: Position,
  deltaMs: number,
  bounds: MovementBounds,
): Position {
  assertNonNegativeFinite(deltaMs, "deltaMs");
  assertNonNegativeFinite(bounds.width, "bounds.width");
  assertNonNegativeFinite(bounds.height, "bounds.height");
  const padding = bounds.padding ?? 0;
  assertNonNegativeFinite(padding, "bounds.padding");
  if (padding * 2 > bounds.width || padding * 2 > bounds.height) {
    throw new Error("padding은 이동 영역의 절반보다 클 수 없습니다.");
  }

  const deltaSeconds = deltaMs / 1_000;
  return {
    x: Math.min(
      bounds.width - padding,
      Math.max(padding, position.x + velocity.x * deltaSeconds),
    ),
    y: Math.min(
      bounds.height - padding,
      Math.max(padding, position.y + velocity.y * deltaSeconds),
    ),
  };
}
