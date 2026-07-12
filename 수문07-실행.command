#!/bin/bash
# 더블클릭으로 수문 07 개발 서버를 띄우고 브라우저를 연다.
# 게임은 네이티브 창이 아니라 브라우저(http://127.0.0.1:5180/)에서 실행된다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # nvm이 있으면 저장소 .nvmrc(Node 24)를 맞춘다.
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh"
  nvm use >/dev/null
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
  fi
fi

if ! command -v pnpm >/dev/null 2>&1; then
  osascript -e 'display alert "pnpm을 찾을 수 없습니다" message "corepack enable 후 다시 실행하세요." as critical'
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "의존성을 설치합니다…"
  pnpm install
fi

# 다른 프로젝트의 Vite(예: 5173)와 겹치지 않도록 player 전용 포트 사용
PORT=5180
URL="http://127.0.0.1:${PORT}/"

is_floodgate_server() {
  local body
  body="$(curl -sf "$URL" 2>/dev/null || true)"
  [[ "$body" == *"root"* ]] || [[ "$body" == *"WebGameMaker"* ]] || [[ "$body" == *"/src/main"* ]]
}

if is_floodgate_server; then
  echo "이미 실행 중인 수문 07 서버를 엽니다: $URL"
  open "$URL"
  exit 0
fi

if curl -sf "$URL" >/dev/null 2>&1; then
  osascript -e "display alert \"포트 ${PORT}가 다른 앱에 사용 중입니다\" message \"해당 프로세스를 종료한 뒤 다시 실행하세요.\" as critical"
  exit 1
fi

echo "수문 07 개발 서버를 시작합니다…"
echo "브라우저 주소: $URL"
pnpm --filter @web-game-maker/schema build
pnpm --filter @web-game-maker/player exec vite --host 127.0.0.1 --port "$PORT" --strictPort &
DEV_PID=$!

cleanup() {
  if kill -0 "$DEV_PID" 2>/dev/null; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 90); do
  if is_floodgate_server; then
    open "$URL"
    echo ""
    echo "브라우저를 열었습니다: $URL"
    echo "조작: WASD 이동, Space 조사광, F3 제작 정보"
    echo "이 창을 닫으면 서버가 종료됩니다."
    wait "$DEV_PID"
    exit 0
  fi
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo "개발 서버가 시작되지 않았습니다."
    exit 1
  fi
  sleep 0.5
done

echo "서버 응답 대기 시간 초과 ($URL)"
exit 1
