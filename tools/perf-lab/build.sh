#!/usr/bin/env bash
# Собирает web из текущего дерева и кладёт standalone в $PERF_LAB_DIR/builds/<name>.
# usage: tools/perf-lab/build.sh <name>
# API_URL сборки — публичный апекс: SSG-страницы товаров берут данные прода (только GET).
set -euo pipefail
NAME=${1:?name}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=${PERF_LAB_DIR:-/tmp/perf-lab}
mkdir -p "$OUT"
cd "$ROOT"
NEXT_PUBLIC_SITE_URL=https://ximi4ka.ru NEXT_PUBLIC_API_URL=https://ximi4ka.ru API_URL=https://ximi4ka.ru \
  NEXT_TELEMETRY_DISABLED=1 npm run build -w web >"$OUT/build-$NAME.log" 2>&1 || {
  tail -30 "$OUT/build-$NAME.log"
  exit 1
}
rm -rf "$OUT/builds/$NAME" && mkdir -p "$OUT/builds/$NAME/web/.next"
cp -R web/.next/standalone/. "$OUT/builds/$NAME/"
cp -R web/.next/static "$OUT/builds/$NAME/web/.next/static"
cp -R web/public "$OUT/builds/$NAME/web/public"
echo "built $NAME → $OUT/builds/$NAME"
