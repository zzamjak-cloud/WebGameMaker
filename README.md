# WebGameMaker

기획자·개발자·디자이너가 같은 저장소에서 웹 게임을 설계하고 검증하는 로컬 우선 제작 도구다. 첫 수직 절편은 탑다운 액션이며, Studio 편집 범위에 게임 HUD를 포함한다. 첫 배포 목표는 서버 없이 실행 가능한 로컬 정적 export다.

## 현재 기준

- Node.js 24.18.0 LTS
- pnpm 11.12.0
- TypeScript 6 strict mode
- Vite 8, Vitest 4, Playwright 1
- Phaser 4.2.1 런타임
- Phase 1 탑다운 수직 절편 `수문 07 — 마지막 등불`
- Phase 2 모듈 SDK·공용 P0 모듈
- Phase 3 기획·에셋 풀과 `wgm` CLI

## 바로 실행

Finder에서 `수문07-실행.command`를 더블클릭하면 개발 서버를 띄우고 브라우저를 연다. 주소는 `http://127.0.0.1:5180/`이며, 터미널 창을 닫으면 서버가 종료된다.

## 실행 화면

- 기본 `/`: 탑다운 액션과 React 게임 HUD
- `?view=compat`: Phase 0 Phaser 호환성 계측대

게임 조작은 `WASD`/방향키 이동, `Space` 조사광, `F3` 제작 정보다. 결과 화면에서는 `R` 또는 다시 시작 버튼으로 재시작한다.

## 시작

```bash
nvm use
corepack enable
pnpm install
pnpm exec playwright install
pnpm verify
```

## 공통 명령

| 명령 | 용도 |
|---|---|
| `pnpm dev` | 개발 서버를 병렬 실행 |
| `pnpm lint` | 전체 워크스페이스 정적 검사 |
| `pnpm typecheck` | 패키지와 E2E TypeScript 검사 |
| `pnpm test` | 단위·계약 테스트 실행 |
| `pnpm coverage` | schema 핵심 계약의 80% coverage gate 실행 |
| `pnpm build` | 전체 프로덕션 빌드 |
| `pnpm wgm validate examples/minimal` | 프로젝트와 장면 bundle 교차 참조 검증 |
| `pnpm validate:games` | 실제 게임 프로젝트 schema·참조 검증 |
| `pnpm measure:reuse -- --check` | Phase 1 재사용 비용 기준선 drift 검사 |
| `pnpm e2e` | Playwright 브라우저 검증 실행 |
| `pnpm e2e --grep @vertical-slice` | 시작→승패→재시작 수직 절편 검증 |
| `pnpm e2e --grep @smoke` | 3개 브라우저 호환성 회귀 검증 |
| `pnpm test:e2e` | 정적 player build를 실제 브라우저로 검증 |
| `pnpm verify` | lint부터 E2E까지 전체 게이트 실행 |

## 워크스페이스

- `apps/`: Studio와 게임 player 같은 실행 앱
- `games/`: 추출 전 게임별 JSON과 gameplay 기능
- `library/`: 기획 문서 풀과 아트 리소스 풀
- `packages/`: 스키마·모듈·에셋 도구·CLI 공용 계약
- `tests/benchmarks/`: 재사용 비용 측정과 Phase 1 기준선
- `tests/e2e/`: 브라우저 호환성과 수직 절편 검증
- `docs/decisions/`: 장기 영향을 주는 기술 결정
- `Plan/`: 원본 요구와 단계별 구축 계획

기획 의도는 Markdown, 편집 가능한 프로젝트 상태는 JSON, 실행 동작은 TypeScript를 단일 기준으로 삼는다.

추가 CLI:

| 명령 | 용도 |
|---|---|
| `pnpm wgm designs validate` | 기획 문서 front matter·10섹션 검증 |
| `pnpm wgm catalog search --type design\|asset\|module` | 카탈로그 검색 |
| `pnpm wgm asset import <path> --id asset.* --tag <tag>` | 이미지 에셋 등록 |
| `pnpm wgm game create game.<id>` | 게임·기획 골격 생성 |
| `pnpm test:designs` / `pnpm test:assets` | Phase 3 게이트 테스트 |
