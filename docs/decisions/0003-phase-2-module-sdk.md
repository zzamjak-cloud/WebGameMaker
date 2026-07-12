# ADR 0003: Phase 2 모듈 SDK와 P0 추출

- 상태: 승인
- 날짜: 2026-07-12

## 맥락

Phase 1 수직 절편은 게임 내부 `features`에 이동·AI·전투 로직을 두고 JSON `moduleId`만 선언했다. Phase 2에서는 같은 동작을 공용 모듈 계약으로 승격해 두 번째 게임 재사용의 기반을 만든다.

## 결정

- `packages/module-sdk`에 lifecycle·capability·eventBus·allowlist registry 계약을 둔다.
- `packages/core-modules`에 P0 순수 로직과 manifest를 두고, floodgate는 게임 전용 조사광·신호등만 `features`에 남긴다.
- `packages/runtime`의 `createModuleHost`가 장면 바인딩을 레지스트리로 조립한다. 게임 전용 모듈 ID는 명시적 allowlist로 건너뛴다.
- `packages/schema`에 asset / module-manifest / ui-screen 계약과 identity 마이그레이션 골격을 추가한다.
- Phase 1 재사용 기준선(`commonGameplayLoc=390`, `manualSetupSteps=10`)은 `tests/benchmarks/reuse-baseline.phase-1.json`에 고정해 Phase 4 비교 원본으로 보존한다.

## 결과

- 수직 절편은 공용 모듈 함수와 JSON 설정으로 동일하게 실행된다.
- 이전(v1) fixture와 현재 schema 계약 테스트가 통과한다.
- 임의 URL/`eval` 기반 모듈 로딩은 하지 않는다.

## 남은 범위

- camera-follow / collision-layer / scene-transition의 본격 런타임 구현
- schemaVersion 2 이상 실제 마이그레이션 스텝
- Phase 3 문서·에셋 풀과 CLI
