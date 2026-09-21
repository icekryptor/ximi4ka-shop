# Витрина ximi4ka на своём VPS — ранбук

**Зачем:** Railway-сервис `ximi4ka-shop-api-production` удалён («Application not
found»), из-за чего витрина на Vercel живая, но пустая: каталог 0 товаров,
`/categories/kits` и `/product/himichka-30` — 404. Переезжаем на тот же VPS, где
уже живут ERP и XimiLearn (переезд ERP описан в
`../ximi4ka/docs/VPS-MIGRATION.md`).

## Целевая схема

```
new.ximi4ka.ru → supabase-caddy (80/443, TLS сам)
                   ├ /api/*, /uploads/* → ximishop-api  (Express, :3001)
                   │                        └→ supabase-db (сеть supabase_default,
                   │                           alias db) — БД ximi4ka_shop
                   └ всё остальное      → ximishop-web  (Next.js standalone, :3000)
```

- Код на сервере: `/opt/ximishop/app` (клон `icekryptor/ximi4ka-shop`).
- Секреты: `deploy/app.env` (рантайм api) и `deploy/web.env` (сборка витрины) —
  оба не в гите, шаблоны рядом: `*.env.example`.
- Деплой: `cd /opt/ximishop/app && bash deploy/deploy.sh`.
- Аплоады админки — docker-том `ximishop-uploads` (на Railway они умирали при
  каждом редеплое); импортированные фото товаров пока лежат на static.tildacdn.com.

## Порядок переезда

### 1. База в контейнере supabase-db

```bash
PASS=$(openssl rand -hex 24); echo "$PASS" > /opt/ximishop/.db-pass; chmod 600 /opt/ximishop/.db-pass
docker exec -i supabase-db psql -U postgres <<SQL
CREATE USER ximishop_user WITH PASSWORD '$PASS';
CREATE DATABASE ximi4ka_shop OWNER ximishop_user;
SQL
# uuid_generate_v4() — дефолт у всех первичных ключей, без расширения restore упадёт
docker exec -i supabase-db psql -U postgres -d ximi4ka_shop -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
```

### 2. Данные

Каталог вытащен с Tilda и живёт в локальном Postgres разработчика
(`ximi4ka_shop`: 70 товаров, 5 категорий, 4 статьи, 84 редиректа, настройки
сайта с включённым noindex). Переносим дампом — он точнее, чем повторный импорт:

```bash
# с ноутбука
pg_dump --format=custom --no-owner --no-acl -d ximi4ka_shop -f ximi4ka_shop.dump
scp ximi4ka_shop.dump root@201.34.149.163:/root/backups/
# на сервере
docker cp /root/backups/ximi4ka_shop.dump supabase-db:/tmp/shop.dump
docker exec supabase-db pg_restore -U postgres -d ximi4ka_shop --no-owner --clean --if-exists /tmp/shop.dump
docker exec -i supabase-db psql -U postgres -d ximi4ka_shop \
  -c 'GRANT ALL ON ALL TABLES IN SCHEMA public TO ximishop_user;' \
  -c 'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ximishop_user;'
```

Альтернатива с нуля (если дампа нет): `npm run migration:run -w api`, затем
`seed`, `import:tilda-catalog -- --replace-dev-seed`, `import:tilda-articles`,
`import:tilda-redirects` — исходники лежат в гите, в `api/data/`.

### 3. Код и секреты

```bash
mkdir -p /opt/ximishop && cd /opt/ximishop
git clone git@github.com:icekryptor/ximi4ka-shop.git app   # deploy key, как у ximerp
cd app
cp deploy/app.env.example deploy/app.env   # DATABASE_URL с паролем из /opt/ximishop/.db-pass,
cp deploy/web.env.example deploy/web.env   # ADMIN_SESSION_SECRET=$(openssl rand -hex 32)
```

### 4. Деплой

```bash
bash deploy/deploy.sh
```

Скрипт собирает оба образа, поднимает контейнеры, ждёт healthy api, накатывает
миграции (`api/dist/scripts/migrate.js`) и печатает число товаров в каталоге.

### 5. Caddy

Добавить блок из `deploy/Caddyfile.snippet` в
`/opt/supabase-src/docker/volumes/caddy/Caddyfile`, затем
`docker exec supabase-caddy caddy reload --config /etc/caddy/Caddyfile`.

Пока DNS ещё смотрит на Vercel, проверять можно изнутри сети:

```bash
docker exec ximishop-web wget -qO- http://ximishop-api:3001/health
docker exec ximishop-api wget -qO- http://ximishop-web:3000/ru | head -c 300
```

### 6. DNS-переключение

`new.ximi4ka.ru`: CNAME на `cname.vercel-dns.com` → **A на `201.34.149.163`**.
Сертификат Caddy выпустит при первом обращении. После верификации — снять домен
с Vercel-проекта.

### 7. Смоук после переключения

- `/`, `/catalog`, `/categories/kits`, `/product/himichka-30`, `/blog` — 200 и с контентом;
- `/tproduct/342501029362-mini-himichka` → 301 `/product/mini-himichka`;
- `/sitemap.xml`, `/robots.txt` (должен остаться `Disallow: /`, пока апекс на Tilda),
  `/yml.xml`, `/turbo.xml`, `/blog/rss.xml`;
- админка `/admin`: логин, черновик статьи, загрузка картинки (том переживает редеплой);
- заказ на `/checkout` при `PAYMENT_PROVIDER=manual` — создаётся, статус `pending`.

### 8. Бэкапы

Добавить `ximi4ka_shop` в `/root/backup-db.sh` (ночной `pg_dump` в
`/root/backups/`, ротация 14 дней) — рядом с `ximerp` и `learn`.

## Хвосты

- Апекс `ximi4ka.ru` остаётся на Tilda; noindex снимать только при его переключении.
- CMS-страницы 1:1 с Tilda не перенесены — список в `api/data/cms-pages-todo.md`
  (`/policy`, `/oferta`, `/faq`, `/success`, `/fail` и др.).
- Картинки товаров — на static.tildacdn.com; перезаливка в наш Storage отдельной задачей.
- `web/middleware.ts` → конвенция `proxy` (deprecation Next 16).
