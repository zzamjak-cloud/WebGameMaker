---
id: design.floodgate-07
genre: topdown-action
tags:
  - harbor
  - vertical-slice
  - phase-1
status: active
targetViewport:
  width: 1280
  height: 720
references:
  - game.floodgate-07
---

# 수문 07 — 마지막 등불

## 1. 한 줄 목표와 대상 사용자

폐쇄 직전 해안 수문에서 정비 드론으로 먹물 생물을 몰아내 신호등 3개를 켠다. 기획·개발·디자이너가 수직 절편을 검증한다.

## 2. 핵심 플레이 루프

이동 → 적 순찰/추적 대응 → 조사광 공격 → 신호등 점등 → 승패 → 재시작.

## 3. 입력과 조작

WASD/방향키 이동, Space 조사광, F3 제작 정보, 결과 화면 R 재시작.

## 4. 장면과 진행 구조

단일 world 장면 `scene.floodgate-07-main`에서 한 판을 완주한다.

## 5. 엔티티·규칙·승패 조건

플레이어 체력 0이면 패배, 적 3마리 제거로 신호등 3개 점등 시 승리. 접촉 피해에 무적 시간이 있다.

## 6. UI/HUD와 피드백

React HUD로 체력·신호등·렌즈 열·결과 오버레이를 표시한다. prefers-reduced-motion을 존중한다.

## 7. 필요한 아트·오디오 목록

수문 구조물·조사광·먹물체 실루엣. 오디오는 Phase 0 정책상 noAudio.

## 8. 재사용할 기존 모듈·에셋

`module.player-move-2d`, `module.health`, `module.enemy-patrol`, `module.enemy-chase`, `module.damage-contact`.

## 9. 새로 구현할 기능과 공용화 후보

조사광 펄스·신호등은 게임 전용. camera-follow·collision-layer는 후속 공용화 후보.

## 10. 실행 가능한 인수 조건

`pnpm e2e --grep @vertical-slice`로 승리·패배·재시작과 console error 0을 확인한다.
