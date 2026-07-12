import { compileProject, createRelayState } from "../dist/index.js";

if (typeof compileProject !== "function" || typeof createRelayState !== "function") {
  throw new Error("relay-ward package export를 찾을 수 없습니다.");
}

console.log("relay-ward package exports 검증 성공");
