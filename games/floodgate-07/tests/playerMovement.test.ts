import { describe, expect, it } from "vitest";

import {
  integratePlayerPosition,
  resolvePlayerMovement,
} from "../src/features/playerMovement.js";

describe("playerMovement", () => {
  it("대각선 입력 속도를 정규화한다", () => {
    const intent = resolvePlayerMovement(
      { up: true, down: false, left: false, right: true },
      260,
      "up",
    );

    expect(Math.hypot(intent.velocity.x, intent.velocity.y)).toBeCloseTo(260);
    expect(intent.facing).toBe("right");
  });

  it("입력이 없으면 정지하고 이전 방향을 유지한다", () => {
    expect(
      resolvePlayerMovement(
        { up: false, down: false, left: false, right: false },
        260,
        "down",
      ),
    ).toEqual({ velocity: { x: 0, y: 0 }, facing: "down" });
  });

  it("delta 시간으로 위치를 적분하고 경계 안에 고정한다", () => {
    expect(
      integratePlayerPosition(
        { x: 95, y: 10 },
        { x: 100, y: -100 },
        1_000,
        { width: 100, height: 80, padding: 8 },
      ),
    ).toEqual({ x: 92, y: 8 });
  });

  it("유효하지 않은 시간과 경계를 거부한다", () => {
    expect(() =>
      integratePlayerPosition(
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        -1,
        { width: 100, height: 100 },
      ),
    ).toThrow("deltaMs는 0 이상의 유한한 숫자여야 합니다.");
    expect(() =>
      integratePlayerPosition(
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        1,
        { width: 20, height: 20, padding: 11 },
      ),
    ).toThrow("padding은 이동 영역의 절반보다 클 수 없습니다.");
  });
});
