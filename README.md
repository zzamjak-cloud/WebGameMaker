# WebGameMaker

기획자·개발자·디자이너가 같은 저장소에서 웹 게임을 설계하고 검증하는 로컬 우선 제작 도구다. 첫 수직 절편은 탑다운 액션이며, Studio 편집 범위에 게임 HUD를 포함한다. 첫 배포 목표는 서버 없이 실행 가능한 로컬 정적 export다.

## Phase 0 기준

- Node.js 24.18.0 LTS
- pnpm 11.12.0
- TypeScript 6 strict mode
- Vite 8, Vitest 4, Playwright 1
- Phaser 4.2.1 호환성 검증 후 런타임 버전 고정

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
| `pnpm e2e` | Playwright 브라우저 검증 실행 |
| `pnpm test:e2e` | 정적 player build를 실제 브라우저로 검증 |
| `pnpm verify` | lint부터 E2E까지 전체 게이트 실행 |

## 워크스페이스

- `apps/`: Studio와 게임 player 같은 실행 앱
- `packages/`: 스키마와 런타임 공용 계약
- `tests/e2e/`: 브라우저 호환성과 수직 절편 검증
- `docs/decisions/`: 장기 영향을 주는 기술 결정
- `Plan/`: 원본 요구와 단계별 구축 계획

기획 의도는 Markdown, 편집 가능한 프로젝트 상태는 JSON, 실행 동작은 TypeScript를 단일 기준으로 삼는다.
