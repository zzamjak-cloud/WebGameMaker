# WebGameMaker Phase 7 릴리즈 패키징 계획

## 1. 목표

Phase 7의 목표는 Phase 6 정적 export를 로컬 배포 가능한 릴리즈 패키지로 고정하고, 압축 해제 후에도 동일하게 검증되는 재현 가능한 산출물 흐름을 만드는 것이다.

완료 게이트:

- `releases/player-static/<releaseId>`에 릴리즈 manifest, checksum, 압축 archive를 생성한다.
- archive를 임시 경로에 압축 해제한 뒤 정적 export 검증이 통과한다.
- release manifest가 source commit, export manifest, archive hash, 실행 명령을 포함한다.
- `pnpm verify`가 release packaging gate를 포함해 통과한다.

## 2. 범위 결정

첫 배포 목표는 외부 호스팅이 아니라 로컬 정적 export이므로, Phase 7은 `apps/player` bundle을 기준으로 하는 로컬 패키징까지만 포함한다.

포함 산출물:

- `player-static.tar.gz`
- `release-manifest.json`
- `SHA256SUMS`
- `player-static/**`

제외 항목:

- 원격 배포
- 자동 updater
- 코드 서명
- workspace-server 연동 export

## 3. 릴리즈 식별자

기본 릴리즈 식별자는 `player-static-YYYYMMDD-<shortCommit>` 형식으로 생성한다. 재현 검증이나 CI에서는 `WGM_RELEASE_ID`로 명시 값을 주입할 수 있다.

## 4. 검증 기준

- release archive SHA-256이 manifest와 일치해야 한다.
- `SHA256SUMS`의 모든 항목이 실제 파일과 일치해야 한다.
- archive 압축 해제 결과가 `scripts/verify-export.mjs` 기준을 통과해야 한다.
- release 산출물은 git에 포함하지 않고 `releases/` 아래 ignored artifact로 관리한다.

## 5. 명령

- `pnpm release:player`
- `pnpm verify:release`
- `pnpm verify`
