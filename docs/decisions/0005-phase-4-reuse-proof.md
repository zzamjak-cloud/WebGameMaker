# ADR 0005: Phase 4 두 번째 게임 재사용 증명

## 맥락

Phase 3까지 schema, P0 공용 모듈, 기획 문서, 에셋 풀, CLI 표면은 준비됐지만 실제 두 번째 게임 제작 비용이 줄어드는지는 증명하지 않았다.

## 결정

- 두 번째 탑다운 게임은 `games/relay-ward`의 `Relay Ward — 마지막 전송`으로 둔다.
- 첫 게임과 같은 이동·카메라·체력·적 순찰·추적·충돌 계층 module ID를 JSON에서 참조한다.
- 게임 전용 규칙은 relay node 순서 동기화와 pulse cooldown으로 제한한다.
- Phase 4 게이트는 `tests/benchmarks/phase4-reuse-gate.ts`에서 측정값, 필수 module ID, 첫 게임 import 금지, 20줄 이상 중복 게임 로직 금지를 함께 검사한다.
- Studio 멀티게임 선택 UI와 HUD 인스펙터는 Phase 5 범위로 유지한다.

## 결과

- `games/relay-ward` 패키지와 `design.relay-ward` 기획 문서를 추가했다.
- Phase 4 기준선은 `commonGameplayLoc=149`, `manualSetupSteps=4`다.
- Phase 1 기준선(`390`, `10`) 대비 LOC는 61.8%, 수동 단계는 60.0% 감소했다.
- `pnpm measure:reuse:phase4`가 재사용 감소율과 금지 import·중복 블록을 검증한다.

## 남은 범위

- Phase 5에서 Studio MVP가 두 게임을 열고 HUD 포함 편집·preview·save 흐름을 검증해야 한다.
- 현재 공용 module definition의 runtime instance는 대부분 no-op이므로, Studio 실행 편집 단계에서 capability 기반 runtime 적용 범위를 다시 결정한다.
