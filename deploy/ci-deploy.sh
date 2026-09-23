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
#
# Лог Actions у репозитория публичный, поэтому в ssh уходят только маркеры
# шагов deploy.sh; полный вывод (логи контейнеров при сбое и т. п.) — только в
# /opt/ximishop/deploy-logs на сервере (последние 30).
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."

  local log_dir=/opt/ximishop/deploy-logs lock_file=/opt/ximishop/.deploy.lock
  if [[ -n "${CI_DEPLOY_TEST:-}" ]]; then
    log_dir=${CI_DEPLOY_LOG_DIR:?}
    lock_file=${CI_DEPLOY_LOCK:?}
  fi

  local sha=${SSH_ORIGINAL_COMMAND:-}
  if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "❌ ожидался полный SHA коммита (40 hex-символов), получено: '${sha:0:80}'" >&2
    exit 64
  fi

  # Замок наследует и отвязанный deploy.sh, так что он держится до конца
  # выкатки, даже если ssh-сессия уже закрылась. deploy.sh берёт тот же замок
  # при ручном запуске; здесь он уже взят — об этом говорит XIMISHOP_DEPLOY_LOCKED.
  exec 9>"$lock_file"
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

  mkdir -p "$log_dir"
  local log
  log="$log_dir/$(date +%F-%H%M%S)-${sha:0:7}.log"
  : >"$log"
  XIMISHOP_DEPLOY_LOCKED=1 setsid -w bash -c \
    'bash deploy/deploy.sh --no-pull >"$1" 2>&1; echo $? >"$1.exit"' _ "$log" </dev/null &
  local deploy_pid=$!
  tail -n +1 -f "$log" | awk '/^(→|✅|❌|⚠️|  )/ { print; fflush() }' &
  local tail_pid=$!
  until [[ -f "$log.exit" ]] || ! kill -0 "$deploy_pid" 2>/dev/null; do sleep 2; done
  sleep 1
  kill "$tail_pid" 2>/dev/null || true
  pkill -P "$$" tail 2>/dev/null || true

  # Старые логи — прочь, остаются последние 30 выкаток.
  ls -1t "$log_dir"/*.log | tail -n +31 | while read -r old; do rm -f "$old" "$old.exit"; done

  if [[ ! -f "$log.exit" ]]; then
    echo "❌ процесс выкатки завершился, не оставив кода выхода — см. $log на сервере" >&2
    exit 1
  fi
  local code
  code=$(cat "$log.exit")
  [[ "$code" == 0 ]] || echo "❌ deploy.sh завершился с кодом $code — полный лог: $log на сервере" >&2
  exit "$code"
}

# Весь скрипт разбирается до запуска: git merge выше подменяет этот файл.
main "$@"; exit
