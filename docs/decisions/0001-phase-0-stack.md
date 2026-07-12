# ADR 0001: Phase 0 기술 기준선

- 상태: 승인
- 날짜: 2026-07-12

## 맥락

WebGameMaker는 기획자·개발자·디자이너가 함께 사용하는 로컬 우선 웹 게임 제작 환경이다. 초기에는 탑다운 액션 한 장르와 HUD 편집, 로컬 정적 export에 집중하며, 앱과 공용 계약을 하나의 저장소에서 재현 가능하게 검증해야 한다.

## 결정

- Node.js 24.18.0 LTS와 pnpm 11.12.0을 고정한다.
- `apps/*`, `packages/*`를 단일 pnpm workspace와 lockfile로 관리한다.
- TypeScript 6.0.3 strict mode를 모든 실행 코드의 공통 기준으로 사용한다.
- React 기반 Studio와 Phaser player는 Vite 8.1.4로 개발·빌드한다.
- Phaser 4.2.1을 런타임 기준으로 고정한다.
- 단위·계약 테스트는 Vitest 4.1.10, 브라우저 검증은 Playwright 1.61.1을 사용한다.
- ESLint 10.7.0과 typescript-eslint 8.63.0으로 TypeScript 6 peer 범위를 명시적으로 충족한다.
- 초기에는 Turborepo와 데이터베이스를 도입하지 않는다. 로컬 파일과 Git이 원본이다.
- E2E는 production build를 정적 preview로 띄우고 Chromium 전체, Firefox/WebKit smoke를 검증한다.
- 오디오는 Phase 0 호환성 범위에서 의도적으로 제외하고 `audio.noAudio`를 사용한다. 브라우저 unlock·재생·정리 계약은 별도 호환성 단계에서 검증한 뒤 활성화한다.

## 결과

- 루트의 `pnpm verify`가 lint, typecheck, test, build, E2E 순서의 공통 완료 게이트가 된다.
- workspace dependency와 도구 버전이 한 lockfile에서 재현된다.
- Chromium·Firefox·WebKit에서 키 입력에 따른 좌표·camera scroll 변화, 실제 barrier 충돌 차단, PNG/SVG source·display scale, opaque-origin iframe 메시지 왕복을 수치로 검증한다.
- E2E 전용 프로브가 `EventTarget` listener와 window timeout·interval·animation frame을 계측하며, Phaser 생성 전 기준선 대비 세 번의 destroy 지점에서 canvas와 전역 자원 양의 잔존이 0이고 재생성 후 자원 구성이 최초 실행과 같음을 확인한다. 프로브는 검증 종료 시 원래 전역 API를 복구한다.
- iframe은 `allow-scripts`만 허용하고 부모·자식 모두 메시지 source, channel, version, type을 검증한다. opaque-origin 자식이 부모 DOM에 접근할 수 없음도 E2E에서 확인한다.
- Phaser 4.2.1이 제거하지 않는 document visibility listener와 window blur/focus handler는 player 인스턴스 경계에서 회수·복구한다. 오디오는 Phase 0 검증 범위 밖이므로 `noAudio`로 browser unlock listener 생성을 막고 별도 호환성 단계로 미룬다.
- opaque-origin iframe의 module 로딩에는 CORS 응답이 필요하므로 개발·preview 서버가 player 정적 자산에 `Access-Control-Allow-Origin: *`를 제공한다.
- `base: './'` build는 `/phase-0/nested/` preview에서 정적 자산과 sandbox iframe을 함께 실행해 임의 하위 경로 배포 가능성을 검증한다.
- Phaser 4 데이터 URI 로더에는 Base64 SVG를 전달하고, 카메라 준비 여부는 첫 render 전에도 유효한 viewport 크기로 판정한다.
- 빌드 캐시나 서버 저장소는 측정된 병목 또는 다중 사용자 요구가 생긴 뒤 별도 ADR로 결정한다.
