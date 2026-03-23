#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUNDLE_DIR="${1:-}"

usage() {
  echo "usage: bash reference-backend/scripts/stage-deploy.sh <bundle-dir>" >&2
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

if [[ -z "$BUNDLE_DIR" ]]; then
  usage
  exit 1
fi

if [[ -e "$BUNDLE_DIR" && ! -d "$BUNDLE_DIR" ]]; then
  echo "[stage-deploy] bundle path exists but is not a directory: $BUNDLE_DIR" >&2
  exit 1
fi

mkdir -p "$BUNDLE_DIR"

SOURCE_BINARY="$ROOT/reference-backend/reference-backend"
SOURCE_SQL="$ROOT/reference-backend/deploy/reference-backend.up.sql"
SOURCE_APPLY_SCRIPT="$ROOT/reference-backend/scripts/apply-deploy-migrations.sh"
SOURCE_SMOKE_SCRIPT="$ROOT/reference-backend/scripts/deploy-smoke.sh"

TARGET_BINARY="$BUNDLE_DIR/reference-backend"
TARGET_SQL="$BUNDLE_DIR/reference-backend.up.sql"
TARGET_APPLY_SCRIPT="$BUNDLE_DIR/apply-deploy-migrations.sh"
TARGET_SMOKE_SCRIPT="$BUNDLE_DIR/deploy-smoke.sh"

printf '[stage-deploy] building reference-backend\n'
(
  cd "$ROOT"
  cargo run -p meshc -- build reference-backend
)

for required_path in \
  "$SOURCE_BINARY" \
  "$SOURCE_SQL" \
  "$SOURCE_APPLY_SCRIPT" \
  "$SOURCE_SMOKE_SCRIPT"
  do
  if [[ ! -f "$required_path" ]]; then
    echo "[stage-deploy] missing required source artifact: $required_path" >&2
    exit 1
  fi
done

if [[ ! -x "$SOURCE_BINARY" ]]; then
  echo "[stage-deploy] compiled binary is not executable: $SOURCE_BINARY" >&2
  exit 1
fi

printf '[stage-deploy] staging bundle dir=%s\n' "$BUNDLE_DIR"
cp "$SOURCE_BINARY" "$TARGET_BINARY"
cp "$SOURCE_SQL" "$TARGET_SQL"
cp "$SOURCE_APPLY_SCRIPT" "$TARGET_APPLY_SCRIPT"
cp "$SOURCE_SMOKE_SCRIPT" "$TARGET_SMOKE_SCRIPT"
chmod 755 "$TARGET_BINARY" "$TARGET_APPLY_SCRIPT" "$TARGET_SMOKE_SCRIPT"

printf '[stage-deploy] staged layout\n'
for staged_path in \
  "$TARGET_BINARY" \
  "$TARGET_SQL" \
  "$TARGET_APPLY_SCRIPT" \
  "$TARGET_SMOKE_SCRIPT"
  do
  printf '[stage-deploy] - %s\n' "$staged_path"
done

printf '[stage-deploy] bundle ready dir=%s\n' "$BUNDLE_DIR"
