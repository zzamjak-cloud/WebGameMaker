# WebGameMaker Phase 5 Studio MVP 계획

## 1. 목표

Phase 5의 목표는 기획자·개발자·디자이너가 같은 프로젝트 JSON을 보며 HUD 포함 편집, draft preview, 저장, 재실행을 한 화면에서 검증하는 Studio MVP를 만든다.

완료 게이트:

- `?view=studio`에서 프로젝트 선택, 파일 트리, 편집 캔버스, 인스펙터, 에셋/모듈 브라우저, undo/redo, play/reset이 동작한다.
- `game.floodgate-07`과 `game.relay-ward`를 선택할 수 있다.
- HUD 텍스트, HUD accent 색, 플레이어 속도, 첫 적 순찰 속도를 수정할 수 있다.
- 수정값은 draft preview iframe에 저장 전 반영되고, 저장 후 reload 가능한 Studio draft store에 유지된다.
- Play iframe은 sandbox 안에서 별도 preview runtime으로 시작하고 reset 3회 후 listener/timer/raf/canvas 잔존이 0임을 E2E가 확인한다.
- 기존 `?view=compat`와 기본 수직 절편 E2E는 유지된다.

## 2. 범위 결정

이번 단계의 workspace service는 브라우저 localStorage 기반 draft store로 구현한다. 실제 파일 시스템 저장 서버는 Phase 6의 정적 export·asset staging·복구/백업 설계와 함께 다룬다.

이유:

- 현재 앱은 `apps/player` 단일 Vite 앱이며 별도 server package가 없다.
- Phase 5 완료 게이트는 편집→draft preview→저장→재실행의 제품 표면 검증이다.
- 파일 시스템 쓰기 API를 먼저 만들면 export 안정화와 권한·원자 저장 정책이 섞인다.

## 3. Studio UX

대상 사용자는 기획자·개발자·디자이너 1차 사용자다. 첫 화면은 마케팅이 아니라 작업대다.

레이아웃:

- 좌측 rail: 프로젝트 선택, 파일 트리, 저장 상태
- 중앙: 16:9 편집 캔버스와 sandboxed play iframe
- 우측: HUD/Gameplay 인스펙터, 에셋 브라우저, 모듈 브라우저
- 하단: schema·preview·cleanup 상태 로그

시각 방향:

- 항만 계측기와 편집 테이프에서 가져온 밝은 작업대 톤을 유지한다.
- Phase 1의 cobalt/coral 색은 상태와 경고에만 사용한다.
- signature는 캔버스 위 HUD anchor grid와 저장 전 draft stripe다.

## 4. 데이터 모델

Studio draft는 프로젝트 원본을 직접 덮어쓰지 않고 다음 편집 가능한 projection을 둔다.

- `hud.title`
- `hud.objectiveLabel`
- `hud.accentColor`
- `hud.offsetX`
- `hud.offsetY`
- `gameplay.playerSpeed`
- `gameplay.firstEnemyPatrolSpeed`

저장은 localStorage에 `{projectId, revision, savedAt, draft}`로 기록한다.

## 5. 검증

- `pnpm --filter @web-game-maker/player test`
- `pnpm e2e --grep @studio`
- `pnpm verify`
- 수동 브라우저 확인: `?view=studio`에서 draft preview, 저장, reload, reset 3회, console error 0 확인
