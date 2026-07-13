# WebGameMaker Phase 8 제품 기능 후보 일괄 진행 계획

## 1. 목표

Phase 8의 목표는 Phase 7 이후 문서에 남아 있던 제품 표면 후보를 로컬 정적 배포 목표와 충돌하지 않는 범위에서 실제 사용 가능한 기능으로 묶는 것이다.

완료 게이트:

- 현재 사용 중인 Node 25에서 package engine 경고가 사라진다.
- Studio에서 draft를 적용 가능한 JSON patch bundle로 export할 수 있다.
- Studio preview가 desktop/mobile viewport simulation을 전환한다.
- Studio inspector가 draft 유효성 상태와 schema 기반 필드 제약을 표시한다.
- Player route가 view 단위 lazy loading으로 분리되어 Studio 진입 시 Phaser chunk를 선로딩하지 않는다.
- `wgm module create/promote`로 공용 모듈 후보 scaffold를 만들 수 있다.
- `pnpm verify`가 통과한다.

## 2. 범위 결정

포함:

- Node `>=24 <26` engine 범위
- Studio draft export bundle
- 모바일 preview simulation
- inspector validation/schema hint
- route-level code splitting
- module create/promote scaffold

제외:

- 외부 서버 파일 쓰기
- 이미지 네이티브 리샘플/WebP 파이프라인
- 코드 서명·원격 배포

위 제외 항목은 정적 export 릴리즈 목표를 넘거나 새 native dependency 선택이 필요하므로 별도 단계로 분리한다.
