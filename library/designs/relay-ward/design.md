---
id: design.relay-ward
genre: topdown-action
tags:
  - relay
  - reuse-proof
  - phase-4
status: active
targetViewport:
  width: 1280
  height: 720
references:
  - game.relay-ward
---

# Relay Ward — 마지막 전송

## 1. 한 줄 목표와 대상 사용자

감시 구역을 통과해 relay node 3개를 순서대로 동기화한다. 기획·개발·디자이너가 두 번째 게임 제작 비용을 검증한다.

## 2. 핵심 플레이 루프

이동 → 순찰 경로 파악 → 추적 회피 → relay pulse → 다음 node 개방 → 송신 완료.

## 3. 입력과 조작

WASD/방향키 이동, Space relay pulse, 결과 화면 R 재시작을 기준으로 한다.

## 4. 장면과 진행 구조

단일 world 장면 `scene.relay-ward-main`에서 세 relay node를 순서대로 처리한다.

## 5. 엔티티·규칙·승패 조건

플레이어 체력 0이면 패배, relay node 3개를 순서대로 동기화하면 승리. 순서 오류는 진행도를 되돌리지 않고 입력만 거부한다.

## 6. UI/HUD와 피드백

HUD는 체력, 다음 relay 순서, pulse 대기 시간을 표시한다. Studio HUD 편집은 Phase 5 범위다.

## 7. 필요한 아트·오디오 목록

송신 구역 바닥 표식, relay node 3종, 감시자 실루엣. 오디오는 현 단계에서 noAudio 정책을 유지한다.

## 8. 재사용할 기존 모듈·에셋

`module.player-move-2d`, `module.camera-follow`, `module.health`, `module.enemy-patrol`, `module.enemy-chase`, `module.collision-layer`, `module.damage-contact`.

## 9. 새로 구현할 기능과 공용화 후보

relay node 순서 규칙과 pulse cooldown은 게임 전용으로 둔다. 두 게임 이상에서 반복되면 objective-chain 후보로 승격한다.

## 10. 실행 가능한 인수 조건

`pnpm --filter @web-game-maker/relay-ward test`와 Phase 4 재사용 게이트가 모두 통과해야 한다.
