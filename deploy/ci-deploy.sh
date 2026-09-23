#!/usr/bin/env bash
# Точка входа для автодеплоя из GitHub Actions. Не вызывается руками: это
# forced command CI-ключа в /root/.ssh/authorized_keys на сервере —
#   restrict,command="/opt/ximishop/app/deploy/ci-deploy.sh" ssh-ed25519 AAAA… github-actions-deploy
# так что ключ умеет ровно одно: выкатить коммит из main. Шелла, туннелей и
# чтения файлов он не даёт; единственный ввод — SHA, который CI передаёт как
# команду ssh (он приходит сюда в $SSH_ORIGINAL_COMMAND).
#
# Выкатывается именно проверенный коммит, а не то, что успело прилететь в main
# позже. Сам deploy.sh отвязан от ssh-сессии: если связь с раннером оборвётся,
# выкатка дойдёт до конца, а не остановится посреди `up -d` или миграций.
# Логи — в /opt/ximishop/deploy-logs (последние 30).
set -euo pipefail
cd "$(dirname "$0")/.."

LOG_DIR=${CI_DEPLOY_LOG_DIR:-/opt/ximishop/deploy-logs}
LOCK_FILE=${CI_DEPLOY_LOCK:-/opt/ximishop/.deploy.lock}

sha=${SSH_ORIGINAL_COMMAND:-${1:-}}
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "❌ ожидался полный SHA коммита (40 hex-символов), получено: '${sha:0:80}'" >&2
  exit 64
fi

# Замок наследует и отвязанный deploy.sh, так что он держится до конца выкатки,
# даже если ssh-сессия уже закрылась.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "❌ уже идёт другой деплой — повторите позже" >&2
  exit 75
fi

echo "→ git fetch origin main"
git fetch --quiet origin main
if ! git merge-base --is-ancestor "$sha" origin/main; then
  echo "❌ $sha не найден в origin/main — выкатываются только коммиты из main" >&2
  exit 65
fi
if git merge-base --is-ancestor "$sha" HEAD; then
  echo "  $sha уже в рабочей копии (HEAD $(git rev-parse --short HEAD)) — пересобираем её"
else
  git merge --ff-only --quiet "$sha"
fi

mkdir -p "$LOG_DIR"
log="$LOG_DIR/$(date +%F-%H%M%S)-${sha:0:7}.log"
: >"$log"
setsid bash -c 'bash deploy/deploy.sh --no-pull >"$1" 2>&1; echo $? >"$1.exit"' _ "$log" </dev/null &
tail -n +1 -f "$log" &
tail_pid=$!
until [[ -f "$log.exit" ]]; do sleep 2; done
sleep 1
kill "$tail_pid" 2>/dev/null || true

# Старые логи — прочь, остаются последние 30 выкаток.
ls -1t "$LOG_DIR"/*.log | tail -n +31 | while read -r old; do rm -f "$old" "$old.exit"; done

code=$(cat "$log.exit" 2>/dev/null || echo 1)
exit "$code"
