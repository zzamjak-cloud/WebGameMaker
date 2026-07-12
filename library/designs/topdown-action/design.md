---
id: design.topdown-action
genre: topdown-action
tags:
  - template
  - minimal
status: draft
targetViewport:
  width: 1280
  height: 720
references:
  - game.topdown-sample
---

# 탑다운 액션 최소 샘플

## 1. 한 줄 목표와 대상 사용자

스키마·검증 fixture용 최소 탑다운 장면이다. 도구와 AI가 계약을 먼저 확인한다.

## 2. 핵심 플레이 루프

배치된 엔티티로 참조 무결성만 검증한다. 완주 플레이는 floodgate-07이 담당한다.

## 3. 입력과 조작

입력은 샘플 범위 밖이다.

## 4. 장면과 진행 구조

`scene.main` 단일 장면.

## 5. 엔티티·규칙·승패 조건

최소 엔티티와 모듈 바인딩만 포함한다.

## 6. UI/HUD와 피드백

없음.

## 7. 필요한 아트·오디오 목록

없음.

## 8. 재사용할 기존 모듈·에셋

검증용 module binding ID만 참조한다.

## 9. 새로 구현할 기능과 공용화 후보

없음.

## 10. 실행 가능한 인수 조건

`pnpm wgm validate examples/minimal`이 성공한다.
