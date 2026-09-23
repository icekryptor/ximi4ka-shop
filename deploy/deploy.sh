#!/usr/bin/env bash
# Деплой витрины ximi4ka на своём VPS. Запускать НА СЕРВЕРЕ из /opt/ximishop/app:
#   bash deploy/deploy.sh            — подтянуть ветку, пересобрать, накатить миграции
#   bash deploy/deploy.sh --no-pull  — только пересобрать (для правок env)
#
# Сборка идёт в новый образ, и только после успеха контейнеры переключаются,
# поэтому неудачная сборка НЕ роняет работающий сайт.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose --env-file deploy/web.env -f deploy/docker-compose.yml)

# Один деплой за раз — тот же замок, что у автодеплоя (deploy/ci-deploy.sh).
# Когда deploy.sh запущен оттуда, замок уже взят родителем.
if [[ -z "${XIMISHOP_DEPLOY_LOCKED:-}" ]]; then
  exec 9>/opt/ximishop/.deploy.lock
  if ! flock -n 9; then
    echo "❌ уже идёт другой деплой (возможно, автодеплой из CI) — повторите позже" >&2
    exit 75
  fi
fi

if [[ "${1:-}" != "--no-pull" ]]; then
  echo "→ git pull"
  git pull --ff-only origin "$(git rev-parse --abbrev-ref HEAD)"
fi

for f in deploy/app.env deploy/web.env; do
  if [[ ! -f "$f" ]]; then
    echo "❌ $f отсутствует — скопируйте $f.example и заполните" >&2
    exit 1
  fi
done

echo "→ сборка образов"
"${COMPOSE[@]}" build
# `docker compose build` умеет завершиться с кодом 0, не собрав ничего (так
# ведёт себя bake, например, при неподдерживаемом build.network) — проверяем,
# что образы действительно появились, иначе up поднимет прошлую версию.
docker image inspect ximishop-api:latest ximishop-web:latest >/dev/null

echo "→ переключение контейнеров"
"${COMPOSE[@]}" up -d

echo "→ ждём healthy api"
for i in $(seq 1 40); do
  st=$(docker inspect ximishop-api --format '{{.State.Health.Status}}' 2>/dev/null || echo starting)
  [[ "$st" == "healthy" ]] && break
  sleep 3
done
if [[ "${st:-}" != "healthy" ]]; then
  echo "❌ api не стал healthy, логи:" >&2
  docker logs ximishop-api --tail 40 >&2
  exit 1
fi

echo "→ миграции"
"${COMPOSE[@]}" exec -T ximishop-api node api/dist/scripts/migrate.js

echo "→ smoke: витрина видит каталог"
total=$(docker exec ximishop-web wget -qO- 'http://ximishop-api:3001/api/public/products?limit=1' \
  | sed -n 's/.*"total":\([0-9]*\).*/\1/p')
echo "  товаров в каталоге: ${total:-0}"
if [[ "${total:-0}" == "0" ]]; then
  echo "⚠️  каталог пуст — база не залита (см. deploy/README.md, шаг «Данные»)" >&2
fi

# Прогрев: страницы с данными намеренно не пререндерятся на сборке (шаги
# buildkit не видят docker-сеть, см. deploy/docker-compose.yml), поэтому первый
# запрос каждой из них — рендер с походом в api. Делаем его сами.
echo "→ прогрев страниц"
for page in /ru /ru/catalog /ru/categories /ru/blog /sitemap.xml /yml.xml; do
  code=$(docker exec ximishop-web wget -S -qO /dev/null "http://127.0.0.1:3000$page" 2>&1 \
    | sed -n 's/.*HTTP\/1\.1 \([0-9]*\).*/\1/p' | tail -1)
  echo "  $page → ${code:-нет ответа}"
done

echo "✅ деплой завершён: $(git rev-parse --short HEAD)"
