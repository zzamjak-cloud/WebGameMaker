import { assertNonNegativeFinite } from "./shared.js";

export function clampHealth(current: number, maximum: number): number {
  assertNonNegativeFinite(current, "current");
  assertNonNegativeFinite(maximum, "maximum");
  return Math.min(maximum, Math.max(0, current));
}

export function applyHealthDamage(
  current: number,
  maximum: number,
  damage: number,
): { health: number; depleted: boolean } {
  assertNonNegativeFinite(damage, "damage");
  const health = clampHealth(current - damage, maximum);
  return { health, depleted: health === 0 };
}

export function applyHealthHeal(
  current: number,
  maximum: number,
  amount: number,
): number {
  assertNonNegativeFinite(amount, "amount");
  return clampHealth(current + amount, maximum);
}
