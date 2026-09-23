#!/usr/bin/env bash
# Проверка deploy/ci-deploy.sh на временных репозиториях, с заглушкой вместо
# deploy.sh. Нужны bash, git, flock, setsid (Linux). Гоняется в CI; локально на
# macOS — в контейнере:
#   docker run --rm -v "$PWD":/src -w /src alpine:3 \
#     sh -c 'apk add -q bash git util-linux && bash deploy/ci-deploy.test.sh'
set -euo pipefail

SRC=$(cd "$(dirname "$0")" && pwd)/ci-deploy.sh
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
export CI_DEPLOY_LOG_DIR="$T/logs" CI_DEPLOY_LOCK="$T/deploy.lock"

fail() { echo "FAIL: $*" >&2; exit 1; }

# origin (bare) ← work: сюда «пушат»; app — рабочая копия на «сервере».
git init -q --bare -b main "$T/origin.git"
git clone -q "$T/origin.git" "$T/work" 2>/dev/null
mkdir -p "$T/work/deploy"
cp "$SRC" "$T/work/deploy/ci-deploy.sh"
# Заглушка deploy.sh: печатает HEAD, ждёт $STUB_SLEEP секунд, выходит с $STUB_EXIT.
cat >"$T/work/deploy/deploy.sh" <<'EOF'
echo "stub deploy $(git rev-parse --short HEAD) args=$*"
sleep "${STUB_SLEEP:-0}"
echo "stub done"
exit "${STUB_EXIT:-0}"
EOF
git -C "$T/work" add -A && git -C "$T/work" commit -qm one && git -C "$T/work" push -q origin main
git clone -q "$T/origin.git" "$T/app"
run() { SSH_ORIGINAL_COMMAND="$1" bash "$T/app/deploy/ci-deploy.sh"; }

echo "1. не SHA → 64"
set +e; run 'rm -rf /' >/dev/null 2>&1; code=$?; set -e
[[ $code == 64 ]] || fail "код $code"

echo "2. коммит не из main → 65"
git -C "$T/work" checkout -qb feature && git -C "$T/work" commit -q --allow-empty -m side
git -C "$T/work" push -q origin feature
side=$(git -C "$T/work" rev-parse HEAD)
git -C "$T/work" checkout -q main
set +e; run "$side" >/dev/null 2>&1; code=$?; set -e
[[ $code == 65 ]] || fail "код $code"
[[ $(git -C "$T/app" rev-parse HEAD) != "$side" ]] || fail "выкатился коммит не из main"

echo "3. коммит из main → fast-forward, вывод deploy.sh в ssh, код 0"
git -C "$T/work" commit -q --allow-empty -m two
two=$(git -C "$T/work" rev-parse HEAD)
git -C "$T/work" commit -q --allow-empty -m three
git -C "$T/work" push -q origin main
out=$(run "$two")
[[ $(git -C "$T/app" rev-parse HEAD) == "$two" ]] || fail "HEAD не на проверенном коммите"
grep -q "stub deploy ${two:0:7} args=--no-pull" <<<"$out" || fail "нет вывода deploy.sh: $out"
grep -q "stub done" <<<"$out" || fail "вывод оборван: $out"
ls "$CI_DEPLOY_LOG_DIR"/*-"${two:0:7}".log >/dev/null || fail "нет лога"

echo "4. deploy.sh упал → код пробрасывается"
set +e; STUB_EXIT=3 run "$two" >/dev/null 2>&1; code=$?; set -e
[[ $code == 3 ]] || fail "код $code"

echo "5. параллельный запуск → 75"
STUB_SLEEP=3 run "$two" >/dev/null 2>&1 &
first=$!
sleep 1
set +e; run "$two" >/dev/null 2>&1; code=$?; set -e
wait "$first"
[[ $code == 75 ]] || fail "код $code"

echo "6. ssh оборвался посреди выкатки → deploy.sh доходит до конца"
rm -rf "$CI_DEPLOY_LOG_DIR"
STUB_SLEEP=3 SSH_ORIGINAL_COMMAND="$two" setsid bash "$T/app/deploy/ci-deploy.sh" >/dev/null 2>&1 &
sess=$!
sleep 1
kill -HUP -- "-$sess" 2>/dev/null || kill -HUP "$sess"
{ wait "$sess"; } 2>/dev/null || true
for _ in $(seq 1 10); do ls "$CI_DEPLOY_LOG_DIR"/*.exit >/dev/null 2>&1 && break; sleep 1; done
grep -q "stub done" "$CI_DEPLOY_LOG_DIR"/*.log || fail "deploy.sh прервался вместе с ssh"
[[ $(cat "$CI_DEPLOY_LOG_DIR"/*.exit) == 0 ]] || fail "код выкатки не 0"

echo "OK: ci-deploy.sh — все сценарии"
