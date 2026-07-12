const api = await import("@web-game-maker/floodgate-07");

const requiredExports = [
  "compileProject",
  "createInitialGameState",
  "stepEnemyAi",
  "applySearchlightPulse",
];

for (const exportName of requiredExports) {
  if (typeof api[exportName] !== "function") {
    throw new Error(`패키지 export를 찾을 수 없습니다: ${exportName}`);
  }
}

console.log("floodgate-07 package exports 검증 성공");
