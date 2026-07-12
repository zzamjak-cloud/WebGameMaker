# WebGameMaker Phase 6 Export와 안정화 계획

## 1. 목표

Phase 6의 목표는 첫 배포 목표인 로컬 정적 export를 실제 산출물로 만들고, 정적 서버에서 실행·보안·성능·visual 회귀를 검증하는 것이다.

완료 게이트:

- `exports/player-static`에 독립 실행 가능한 정적 player export를 생성한다.
- export 산출물에는 manifest, CSP, 보안 header, asset manifest, recovery manifest가 포함된다.
- 임의 하위 경로 정적 서버에서 Chromium 전체 흐름과 Firefox/WebKit smoke가 통과한다.
- visual baseline과 performance/security budget이 자동 검사로 통과한다.
- `pnpm verify`가 export gate를 포함해 통과한다.

## 2. 범위 결정

이번 단계의 export 대상은 `apps/player` 정적 bundle이다. Studio draft를 파일 시스템으로 저장하는 workspace-server는 Phase 5에서 제외했으므로, Phase 6 export도 저장 서버 없이 실행 가능한 정적 앱을 기준으로 한다.

정적 export 산출물:

- `index.html`
- `assets/**`
- `wgm-export-manifest.json`
- `wgm-asset-manifest.json`
- `wgm-recovery-manifest.json`
- `_headers`

## 3. 보안 기준

- preview iframe은 정적 외부 preview script를 로드하기 위해 `sandbox="allow-scripts allow-same-origin"`을 사용한다.
- export header는 `default-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'self'`를 포함한다.
- `script-src`는 `self`만 허용하고, Phaser texture 로딩을 위해 `img-src 'self' data: blob:`을 허용한다.
- export HTML에 외부 HTTP/HTTPS asset 참조가 없어야 한다.
- SVG asset은 Phase 3 sanitize 결과만 export manifest에 포함한다.

## 4. 성능 기준

현 단계는 Phaser chunk가 큰 것을 이미 알고 있으므로 숫자를 숨기지 않는다. Phase 6 예산은 다음으로 고정한다.

- HTML gzip: 8KB 이하
- CSS gzip: 12KB 이하
- entry JS gzip: 90KB 이하
- vertical slice runtime gzip: 40KB 이하
- Phaser lifecycle chunk gzip: 380KB 이하
- 전체 gzip: 540KB 이하

Phaser chunk를 줄이는 code splitting은 Phase 6 이후 최적화 후보로 남긴다.

## 5. visual 기준

Playwright 스크린샷을 고정 baseline hash로 저장하고, 다음 화면을 검사한다.

- 기본 수직 절편 첫 화면
- Studio MVP 첫 화면
- compatibility 계측대 첫 화면

픽셀 완전 비교는 OS·브라우저 차이 때문에 현재 범위에서 과하게 취약하다. 대신 screenshot SHA-256과 이미지 크기를 baseline으로 고정하고 Chromium 기준에서 drift를 차단한다.

## 6. 검증

- `pnpm export:player`
- `pnpm verify:export`
- `pnpm e2e:export`
- `pnpm verify`

브라우저 수동 확인:

- export 정적 서버에서 `/release/checkpoint/` 하위 경로로 접속한다.
- 기본 게임, Studio, compat route가 모두 의미 있는 화면을 렌더링하고 console error 0이어야 한다.
