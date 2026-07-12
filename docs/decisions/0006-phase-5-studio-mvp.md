# ADR 0006: Phase 5 Studio MVP

## 맥락

Phase 4까지 두 게임과 재사용 게이트는 준비됐지만, 사용자가 프로젝트 JSON과 HUD 값을 직접 조정하고 preview/save/reset을 한 화면에서 확인하는 Studio 표면은 없었다.

## 결정

- Studio는 `apps/player`의 `?view=studio` route로 추가한다.
- 프로젝트 선택, 파일 트리, 편집 캔버스, HUD/Gameplay 인스펙터, 에셋/모듈 브라우저, undo/redo, play/reset을 한 화면에 둔다.
- 이번 MVP의 workspace service는 정적 build에서도 동작하는 localStorage draft store로 둔다.
- Play preview는 `sandbox="allow-scripts"` iframe과 `srcDoc` runtime으로 분리하고, draft update와 cleanup 결과는 `postMessage`로만 교환한다.
- 실제 파일 시스템 저장 서버, 원자 저장, 백업, export staging은 Phase 6에서 다룬다.

## 결과

- `?view=studio`에서 `game.floodgate-07`과 `game.relay-ward`를 선택할 수 있다.
- HUD title/objective/accent/offset, player speed, first enemy patrol speed를 수정할 수 있다.
- 저장 후 reload해도 해당 프로젝트 draft가 유지된다.
- `pnpm e2e --grep @studio`가 편집→draft preview→저장→reload→reset 3회 cleanup을 검증한다.

## 남은 범위

- 실제 workspace-server 파일 쓰기와 schema form 자동 생성
- Studio에서 수정한 draft를 실제 game project JSON patch로 export하는 기능
- visual regression baseline과 모바일 preview 세분화
