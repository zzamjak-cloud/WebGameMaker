# ADR 0007: Phase 8 제품 기능 후보

## 상태

Accepted.

## 결정

Phase 8은 정적 export와 충돌하지 않는 제품 표면 후보를 우선 처리한다.

- Node engine은 실제 로컬 검증 환경을 반영해 `>=24 <26`으로 둔다.
- Studio draft는 서버 파일 쓰기 대신 JSON patch bundle로 export한다.
- 모바일 preview는 실기기 지원이 아니라 viewport simulation으로 둔다.
- inspector에는 schema 기반 필드 제약과 draft validation 상태를 노출한다.
- player entry는 route lazy loading으로 나누어 Studio 진입 시 Phaser runtime chunk를 선로딩하지 않는다.
- `wgm module create/promote`는 registry 자동 연결 전 단계의 scaffold 명령으로 제공한다.

## 남은 범위

- 실제 workspace-server 파일 쓰기
- 네이티브 이미지 리샘플/WebP 파이프라인
