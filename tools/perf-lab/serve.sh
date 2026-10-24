#!/usr/bin/env bash
# Держит сборку поднятой за Go HTTP/2-прокси на 127.0.0.1:8443, пока не нажат Ctrl-C.
# Для inp-lab.mjs: UPSTREAM=127.0.0.1:8443 STEPS=catalog node tools/perf-lab/inp-lab.mjs https://ximi4ka.ru/catalog 6 on early 3
# usage: tools/perf-lab/serve.sh <build-name>
set -uo pipefail
B=${1:?build}
DIR=$(cd "$(dirname "$0")" && pwd)
OUT=${PERF_LAB_DIR:-/tmp/perf-lab}
free_ports() {
  for pid in $(lsof -tiTCP:3100 -sTCP:LISTEN) $(lsof -tiTCP:8443 -sTCP:LISTEN); do kill "$pid"; done
}
free_ports
sleep 1
[ -x "$DIR/h2proxy/h2proxy" ] || (cd "$DIR/h2proxy" && go build -o h2proxy .)
trap free_ports EXIT
(cd "$OUT/builds/$B" && PORT=3100 HOSTNAME=localhost NODE_ENV=production API_URL=https://ximi4ka.ru \
  node web/server.js >"$OUT/server-$B.log" 2>&1) &
"$DIR/h2proxy/h2proxy" 127.0.0.1:8443 http://localhost:3100 >"$OUT/h2-$B.log" 2>&1 &
for _ in $(seq 60); do curl -sk -o /dev/null https://127.0.0.1:8443/ -H 'host: ximi4ka.ru' && break; sleep 0.5; done
echo "serving $B on https://127.0.0.1:8443 (Host: ximi4ka.ru)"
wait
