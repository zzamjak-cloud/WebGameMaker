import { assertNonNegativeFinite } from "./shared.js";

export interface ContactDamageResult {
  health: number;
  invulnerableUntil: number;
  depleted: boolean;
}

/** 무적 시간을 포함한 접촉 피해 계산 */
export function resolveContactDamage(input: {
  health: number;
  maximumHealth: number;
  invulnerableUntil: number;
  damage: number;
  nowMs: number;
  invulnerabilityMs: number;
}): ContactDamageResult | null {
  assertNonNegativeFinite(input.damage, "damage");
  assertNonNegativeFinite(input.nowMs, "nowMs");
  assertNonNegativeFinite(input.invulnerabilityMs, "invulnerabilityMs");
  assertNonNegativeFinite(input.health, "health");
  assertNonNegativeFinite(input.maximumHealth, "maximumHealth");

  if (input.damage === 0 || input.nowMs < input.invulnerableUntil) {
    return null;
  }

  const health = Math.max(0, input.health - input.damage);
  return {
    health,
    invulnerableUntil: input.nowMs + input.invulnerabilityMs,
    depleted: health === 0,
  };
}
