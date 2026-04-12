#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=mesher/scripts/lib/mesh-toolchain.sh
source "$SCRIPT_DIR/lib/mesh-toolchain.sh"

PORT_VALUE="${PORT:-18180}"
WS_PORT_VALUE="${MESHER_WS_PORT:-18181}"
CLUSTER_PORT_VALUE="${MESH_CLUSTER_PORT:-19180}"
PRODUCT_ROOT="$(mesher_abs_path "$MESHER_PACKAGE_DIR/..")"
ARTIFACT_DIR="${MESHER_DEV_ARTIFACT_DIR:-$PRODUCT_ROOT/.tmp/mesher-dev}"
BUILD_DIR=''
BINARY_PATH=''

usage() {
  echo 'usage: bash mesher/scripts/dev.sh' >&2
}

fail() {
  echo "[mesher-dev] $1" >&2
  exit 1
}

if [[ $# -ne 0 ]]; then
  usage
  exit 1
fi

mesher_require_database_url

if [[ ! "$PORT_VALUE" =~ ^[1-9][0-9]*$ ]]; then
  fail "PORT must be a positive integer, got: $PORT_VALUE"
fi

if [[ ! "$WS_PORT_VALUE" =~ ^[1-9][0-9]*$ ]]; then
  fail "MESHER_WS_PORT must be a positive integer, got: $WS_PORT_VALUE"
fi

if [[ ! "$CLUSTER_PORT_VALUE" =~ ^[1-9][0-9]*$ ]]; then
  fail "MESH_CLUSTER_PORT must be a positive integer, got: $CLUSTER_PORT_VALUE"
fi

ARTIFACT_DIR="$(mesher_prepare_bundle_dir "$ARTIFACT_DIR")"
BUILD_DIR="$ARTIFACT_DIR/build"
BINARY_PATH="$BUILD_DIR/mesher"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

printf '[mesher-dev] building Mesher into %s\n' "$BUILD_DIR" >&2
bash "$SCRIPT_DIR/build.sh" "$BUILD_DIR"

if [[ ! -x "$BINARY_PATH" ]]; then
  fail "expected executable Mesher binary at $BINARY_PATH after build"
fi

printf '[mesher-dev] starting Mesher on http://127.0.0.1:%s (ws=%s cluster=%s)\n' "$PORT_VALUE" "$WS_PORT_VALUE" "$CLUSTER_PORT_VALUE" >&2

cd "$BUILD_DIR"
exec env \
  DATABASE_URL="$DATABASE_URL" \
  PORT="$PORT_VALUE" \
  MESHER_WS_PORT="$WS_PORT_VALUE" \
  MESHER_RATE_LIMIT_WINDOW_SECONDS="${MESHER_RATE_LIMIT_WINDOW_SECONDS:-60}" \
  MESHER_RATE_LIMIT_MAX_EVENTS="${MESHER_RATE_LIMIT_MAX_EVENTS:-1000}" \
  MESH_CLUSTER_COOKIE="${MESH_CLUSTER_COOKIE:-dev-cookie}" \
  MESH_NODE_NAME="${MESH_NODE_NAME:-mesher@127.0.0.1:${CLUSTER_PORT_VALUE}}" \
  MESH_DISCOVERY_SEED="${MESH_DISCOVERY_SEED:-localhost}" \
  MESH_CLUSTER_PORT="$CLUSTER_PORT_VALUE" \
  MESH_CONTINUITY_ROLE="${MESH_CONTINUITY_ROLE:-primary}" \
  MESH_CONTINUITY_PROMOTION_EPOCH="${MESH_CONTINUITY_PROMOTION_EPOCH:-0}" \
  "$BINARY_PATH"
