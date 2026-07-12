# ADR 0002: Phase 1 탑다운 수직 절편 경계

- 상태: 승인
- 날짜: 2026-07-12

## 맥락

Phase 1은 에디터나 범용 모듈 SDK보다 먼저 한 판을 완주할 수 있는 탑다운 게임을 만들어 실제 재사용 경계를 확인해야 한다. 동시에 Phase 0의 Phaser 생명주기·iframe 보안·3개 브라우저 호환성 검증을 보존해야 한다.

## 결정

- 첫 게임은 `games/floodgate-07`의 game/scene JSON과 게임 전용 TypeScript 기능으로 둔다.
- 기존 schema validator를 통과한 bundle만 `compileProject`가 게임 실행 설정으로 좁힌다.
- 이동, 적 AI, 전투는 게임별 `src/features`에 두고 Phase 2 전에는 공용 module SDK로 승격하지 않는다.
- Phaser는 월드·물리·조사광·엔티티를, React DOM은 체력·목표·열·결과·제작 정보 HUD를 담당한다.
- 기본 `/`는 수직 절편, `?view=compat`는 기존 호환성 계측대로 분리한다.
- 두 Phaser 실행 경로는 같은 lifecycle 경계로 listener, timer, canvas와 Phaser 4 visibility/window handler를 회수한다.
- simulation은 고정 60Hz로 진행한다. `?e2e=1`의 top-level에서만 실제 keyboard 상태를 고정 tick으로 진행하는 읽기 중심 test bridge를 노출한다.
- test bridge에는 teleport, 강제 피해, 강제 승패나 입력 주입 API를 두지 않는다.
- 모듈 추출 전 재사용 비용은 TypeScript scanner 기반 gameplay LOC와 원자적 setup action 수로 측정한다.

## 결과

- `수문 07 — 마지막 등불`은 이동, 순찰·추적, 조사광·과열, 접촉 피해, 체력, 신호등 3개, 승패와 재시작을 한 장면에서 제공한다.
- 게임 코어 단위 테스트는 23개이며 schema 입력과 package export를 함께 검증한다.
- Phase 1 재사용 기준선은 `commonGameplayLoc=390`, `manualSetupSteps=10`이다.
- 수직 절편 E2E는 실제 canvas focus, keyboard와 고정 tick으로 승리·패배·재시작을 검증한다.
- 호환성 계측대와 opaque-origin iframe 검증은 별도 route에서 그대로 유지한다.

## 남은 범위

- 게임별 기능의 공용 module 계약과 migration은 Phase 2에서 결정한다.
- Studio의 HUD 인스펙터와 편집 UI는 Phase 5 범위다.
- 오디오와 Phaser 대형 bundle 최적화는 현재 비차단 후속 항목이다.
