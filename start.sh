#!/usr/bin/env bash
# Start FATCHAD locally: Mongo (docker), FastAPI backend, Vite frontend.
# Usage:
#   ./start.sh            # start everything (Ctrl-C stops backend + frontend)
#   ./start.sh --down     # also stop the Mongo container on exit
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

STOP_DOCKER=0
if [[ "${1:-}" == "--down" ]]; then
  STOP_DOCKER=1
fi

# 1) Mongo via docker compose
echo "==> Starting Mongo (docker compose up -d)"
docker compose up -d

# 2) Python venv — create if missing, install/refresh requirements
VENV_DIR="$ROOT_DIR/.venv"
REQ_FILE="$ROOT_DIR/backend/requirements.txt"
REQ_STAMP="$VENV_DIR/.requirements.sha256"

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  echo "==> Creating venv at .venv"
  PY_BIN="$(command -v python3 || command -v python)"
  if [[ -z "$PY_BIN" ]]; then
    echo "ERROR: python3 not found on PATH" >&2
    exit 1
  fi
  "$PY_BIN" -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
echo "==> Activated venv at .venv"

if [[ -f "$REQ_FILE" ]]; then
  NEW_HASH="$(sha256sum "$REQ_FILE" | awk '{print $1}')"
  OLD_HASH="$(cat "$REQ_STAMP" 2>/dev/null || true)"
  if [[ "$NEW_HASH" != "$OLD_HASH" ]]; then
    echo "==> Installing Python requirements"
    python -m pip install --upgrade pip >/dev/null
    pip install -r "$REQ_FILE"
    echo "$NEW_HASH" > "$REQ_STAMP"
  else
    echo "==> Python requirements up to date"
  fi
fi

# 2b) Frontend node_modules — install if missing
if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  echo "==> Installing frontend dependencies (npm install)"
  ( cd "$ROOT_DIR/frontend" && npm install )
fi

# 3) Backend (FastAPI / uvicorn)
BACKEND_CMD=(uvicorn app.main:app --reload)

echo "==> Starting backend (uvicorn) in ./backend"
( cd "$ROOT_DIR/backend" && "${BACKEND_CMD[@]}" ) &
BACKEND_PID=$!

# 4) Frontend (Vite) — dev mode: Vite auto-loads .env.development which
# sets VITE_USE_DEMO_AUTH=true, so the demo auth backend is selected
# (login with AurenAdmin / test123, no Cognito calls). Exporting the var
# here too as a fallback in case .env.development is missing.
export VITE_USE_DEMO_AUTH=true
echo "==> Starting frontend (npm run dev, demo auth: AurenAdmin / test123) in ./frontend"
( cd "$ROOT_DIR/frontend" && npm run dev ) &
FRONTEND_PID=$!

cleanup() {
  echo
  echo "==> Shutting down..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
  wait "$FRONTEND_PID" 2>/dev/null || true
  if [[ "$STOP_DOCKER" -eq 1 ]]; then
    echo "==> docker compose down"
    docker compose down
  else
    echo "==> Leaving Mongo container running (use --down next time to stop it)"
  fi
}
trap cleanup INT TERM EXIT

wait
