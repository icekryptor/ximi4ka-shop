#!/usr/bin/env bash
# Поднимает standalone-сборку за Go HTTP/2-прокси (тот же планировщик, что у Caddy)
# и меряет FCP/LCP через fcp-lab.mjs на «медленном 4G».
# usage: tools/perf-lab/bench.sh <build-name> <runs> [paths...]
# Порты 3100 (next) и 8443 (h2proxy) должны быть свободны: скрипт гасит то, что их слушает.
set -uo pipefail
B=${1:?build}
N=${2:-9}
shift 2 || true
if (($#)); then P=("$@"); else P=(/ /catalog /product/himichka-30); fi
DIR=$(cd "$(dirname "$0")" && pwd)
OUT=${PERF_LAB_DIR:-/tmp/perf-lab}
free_ports() {
  # next-server переименовывает процесс, поэтому ищем по порту, а не по имени.
  for pid in $(lsof -tiTCP:3100 -sTCP:LISTEN) $(lsof -tiTCP:8443 -sTCP:LISTEN); do kill "$pid"; done
  sleep 1
}
free_ports
[ -x "$DIR/h2proxy/h2proxy" ] || (cd "$DIR/h2proxy" && go build -o h2proxy .)
(cd "$OUT/builds/$B" && PORT=3100 HOSTNAME=localhost NODE_ENV=production API_URL=${PERF_API_URL:-https://ximi4ka.ru} \
  node web/server.js >"$OUT/server-$B.log" 2>&1) &
"$DIR/h2proxy/h2proxy" 127.0.0.1:8443 http://localhost:3100 >"$OUT/h2-$B.log" 2>&1 &
for _ in $(seq 60); do curl -sk -o /dev/null https://127.0.0.1:8443/ -H 'host: ximi4ka.ru' && break; sleep 0.5; done
for p in "${P[@]}"; do curl -sk -o /dev/null "https://127.0.0.1:8443$p" -H 'host: ximi4ka.ru'; done # прогрев
for p in "${P[@]}"; do
  UPSTREAM=127.0.0.1:8443 node "$DIR/fcp-lab.mjs" "$p" "$B" "$N" 2>&1 | grep -v 'run failed' | tail -1
done
free_ports
