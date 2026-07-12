# ADR 0004: Phase 3 기획·에셋 풀과 CLI

- 상태: 승인
- 날짜: 2026-07-12

## 맥락

Phase 2까지 게임 JSON과 공용 모듈은 준비됐지만, 기획 문서 풀·아트 카탈로그·에이전트용 CLI 표면이 없어 `designId` 참조와 에셋 등록을 재현 가능하게 검증할 수 없었다.

## 결정

- 기획 문서는 `library/designs/<id>/design.md`에 두고 front matter 6키와 고정 10개 `##` 섹션을 강제한다.
- 에셋은 `library/assets/<folder>/{original,thumbnail,asset.json}`과 생성 카탈로그 `library/catalogs/assets.catalog.json`으로 관리한다.
- PNG/JPG/WebP/SVG는 파일 signature와 MIME을 교차 검사하며, 동일 SHA-256과 악성 SVG는 거부한다.
- `packages/project-cli`가 `wgm` 진입점이며 validate/catalog/asset import/game create/dev/build를 제공한다.
- 프로젝트 validate는 schema 참조 검증에 더해 `designId`가 기획 풀에 실존하는지 확인한다.

## 결과

- `pnpm test:designs`와 `pnpm test:assets`로 Phase 3 게이트를 고정한다.
- floodgate-07과 minimal fixture의 design 문서가 카탈로그 검색과 validate에 연결된다.

## 남은 범위

- 실제 썸네일 리샘플·파생 WebP 파이프라인
- `wgm module create/promote`와 Studio 연동은 Phase 4–5
