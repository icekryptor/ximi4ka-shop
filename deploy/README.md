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
- Деплой: автоматически после зелёного CI на `main` (см. «Автодеплой»);
  руками — `cd /opt/ximishop/app && bash deploy/deploy.sh`.
- Аплоады админки — docker-том `ximishop-uploads` (на Railway они умирали при
  каждом редеплое); импортированные фото товаров пока лежат на static.tildacdn.com.

## Порядок переезда

### 1. База в контейнере supabase-db

Роль `postgres` в supabase-db не суперюзер: `CREATE DATABASE ... OWNER` падает с
«must be able to SET ROLE». Всё, что про создание, делается от `supabase_admin`.

```bash
mkdir -p /opt/ximishop
PASS=$(openssl rand -hex 24); echo "$PASS" > /opt/ximishop/.db-pass; chmod 600 /opt/ximishop/.db-pass
docker exec -i supabase-db psql -U supabase_admin <<SQL
CREATE USER ximishop_user WITH PASSWORD '$PASS';
CREATE DATABASE ximi4ka_shop OWNER ximishop_user;
SQL
# uuid_generate_v4() — дефолт у всех первичных ключей, без расширения restore упадёт
docker exec -i supabase-db psql -U supabase_admin -d ximi4ka_shop -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
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
docker exec supabase-db pg_restore -U supabase_admin -d ximi4ka_shop --no-owner /tmp/shop.dump
docker exec -i supabase-db psql -U supabase_admin -d ximi4ka_shop \
  -c 'GRANT ALL ON SCHEMA public TO ximishop_user;' \
  -c 'GRANT ALL ON ALL TABLES IN SCHEMA public TO ximishop_user;' \
  -c 'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ximishop_user;'
```

Альтернатива с нуля (если дампа нет): `npm run migration:run -w api`, затем
`seed`, `import:tilda-catalog -- --replace-dev-seed`, `import:tilda-articles`,
`import:tilda-redirects` — исходники лежат в гите, в `api/data/`.

⚠️ **Закрыть от индексации сразу после restore.** В дампе с машины разработчика
`site_settings.robots_txt` разрешает обход (`Allow: /`), а апекс всё ещё на
Tilda — без этого шага каталог задублируется в индексе против основного сайта:

```bash
docker exec -i supabase-db psql -U supabase_admin -d ximi4ka_shop \
  -c $'UPDATE site_settings SET robots_txt = \'User-agent: *\nDisallow: /\';'
```

Снять — только при переключении апекса (админка → Настройки → robots.txt).

### 3. Код и секреты

Отдельный deploy key не нужен: `/root/.ssh/id_ed25519_github` уже открывает
приватные репозитории владельца (проверяется `git ls-remote`).

```bash
mkdir -p /opt/ximishop && cd /opt/ximishop
git clone git@github.com:icekryptor/ximi4ka-shop.git app
cd app
cp deploy/app.env.example deploy/app.env   # DATABASE_URL с паролем из /opt/ximishop/.db-pass,
cp deploy/web.env.example deploy/web.env   # ADMIN_SESSION_SECRET=$(openssl rand -hex 32)
```

### 4. Деплой

```bash
bash deploy/deploy.sh
```

Скрипт собирает оба образа, поднимает контейнеры, ждёт healthy api, накатывает
миграции (`api/dist/scripts/migrate.js`), печатает число товаров в каталоге и
прогревает главные страницы.

Про прогрев: шаги сборки docker не видят docker-сеть (ни `build.network` с
внешней сетью, ни билдер с `--driver-opt network=...` — второе проверено,
имена контейнеров внутри шагов не резолвятся), поэтому страницы и фиды с
данными намеренно не пререндерятся: они рендерятся по первому запросу и дальше
живут в ISR-кеше. Этот первый запрос делает deploy.sh, чтобы он не достался
живому посетителю.

### 5. Caddy

Блок из `deploy/Caddyfile.snippet` добавляется в
`/opt/supabase-src/docker/volumes/proxy/caddy/Caddyfile` (рядом с `learn.`,
`erp.`, `aics-93.`) — **после** переключения DNS, иначе Caddy будет впустую
долбиться в ACME. Порядок:

```bash
cp Caddyfile Caddyfile.bak-$(date +%F)
cat /opt/ximishop/app/deploy/Caddyfile.snippet >> Caddyfile
docker exec supabase-caddy caddy validate --config /etc/caddy/Caddyfile
docker exec supabase-caddy caddy reload   --config /etc/caddy/Caddyfile
```

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
- `/yml.xml` — 62 оффера и 5 категорий (пустой `<offers></offers>` означает, что
  api отдаёт ошибку на дерево категорий), `/sitemap.xml` — 78 ссылок;
- `/tproduct/342501029362-mini-himichka` → 301 `/product/mini-himichka`;
- `/sitemap.xml`, `/robots.txt` (должен остаться `Disallow: /`, пока апекс на Tilda),
  `/yml.xml`, `/turbo.xml`, `/blog/rss.xml`;
- админка `/admin`: логин, черновик статьи, загрузка картинки (том переживает редеплой);
- заказ на `/checkout` при `PAYMENT_PROVIDER=manual` — создаётся, статус `pending`.

### 8. Бэкапы

Уже добавлено в `/root/backup-db.sh` (запускается из `/etc/cron.d/ximi-db-backup`
в 03:30) рядом с `ximerp` и `learn`: ночной `pg_dump -Fc`, ротация 14 дней,
отметка `ok-shop` в `/root/backups/backup.log`.

## Автодеплой

Push в `main` → workflow `CI` (`.github/workflows/ci.yml`): тесты, затем job
`deploy` по ssh вызывает на сервере `deploy/ci-deploy.sh` с SHA проверенного
коммита. Тот убеждается, что коммит есть в `origin/main`, делает fast-forward
ровно до него и запускает `deploy.sh --no-pull`, отвязав его от ssh-сессии:
обрыв связи с раннером не прерывает выкатку. Вывод идёт в лог job'а и в
`/opt/ximishop/deploy-logs/` (последние 30). Параллельные выкатки отсекает
`flock`. Неудачная сборка сайт не роняет — `deploy.sh` переключает контейнеры
только после неё.

Ключ CI на сервере — forced command: кроме «выкатить SHA из main» он ничего не
умеет (ни шелла, ни туннелей). Но код из `main` выполняется на сервере от root,
так что писать в `main` должны только свои: защита ветки в GitHub обязательна.

### Разовая настройка

```bash
# 1. ключ только для CI (ноутбук; без пароля — его читает раннер)
ssh-keygen -t ed25519 -N '' -C github-actions-deploy -f ~/.ssh/ximishop_ci_deploy

# 2. сервер: ключ умеет только ci-deploy.sh
echo "restrict,command=\"/opt/ximishop/app/deploy/ci-deploy.sh\" $(cat ~/.ssh/ximishop_ci_deploy.pub)" \
  | ssh root@201.34.149.163 'cat >> /root/.ssh/authorized_keys'

# 3. GitHub: секреты и переменные окружения production
gh secret set DEPLOY_SSH_KEY --env production < ~/.ssh/ximishop_ci_deploy
ssh-keyscan -t ed25519 201.34.149.163 > /tmp/ximishop_known_hosts   # сверить отпечаток с ssh-keygen -lf на сервере!
gh secret set DEPLOY_KNOWN_HOSTS --env production < /tmp/ximishop_known_hosts
gh variable set DEPLOY_HOST --env production --body 201.34.149.163
gh variable set DEPLOY_USER --env production --body root
```

Проверка ключа без выкатки: `ssh -i ~/.ssh/ximishop_ci_deploy root@201.34.149.163 nope`
→ «ожидался полный SHA коммита» и код 64.

### Эксплуатация

- Передеплой без нового коммита (правка `deploy/*.env`): Actions → CI →
  Run workflow на `main`.
- Выкатка упала: лог в job'е `deploy` и в `/opt/ximishop/deploy-logs/`; сайт
  остаётся на прошлой версии. «уже идёт другой деплой» (код 75) — кто-то
  выкатывает руками или висит прошлый запуск.
- Ручной `bash deploy/deploy.sh` на сервере по-прежнему работает, но замок CI
  не берёт — не запускать одновременно с автодеплоем.
- Сменить ключ: шаг 1–3 заново и удалить старую строку `github-actions-deploy`
  из `/root/.ssh/authorized_keys`.

## Сразу после переключения DNS

**Сменить пароль админки.** Аккаунт `admin@ximi4ka.local` приехал из дампа с
сид-паролем `admin-password-change-me`, который лежит открытым в
`api/src/seeds/seed.ts`. Меняется в `/admin` под этим же аккаунтом.

## Хвосты

- Апекс `ximi4ka.ru` остаётся на Tilda; noindex снимать только при его переключении.
- CMS-страницы 1:1 с Tilda не перенесены — список в `api/data/cms-pages-todo.md`
  (`/policy`, `/oferta`, `/faq`, `/success`, `/fail` и др.).
- Картинки товаров — на static.tildacdn.com; перезаливка в наш Storage отдельной задачей.
- `web/middleware.ts` → конвенция `proxy` (deprecation Next 16).

## Проверено локально перед выездом

Весь стек прогнан на ноутбуке в docker (postgres в контейнере с восстановленным
дампом, api, web, Caddy перед ними): `deploy.sh` отрабатывает целиком, миграции
накатываются внутри контейнера, витрина отдаёт 62 товара, категории, блог и
фиды. По дороге этим прогоном пойманы три дефекта, которые ломали и прод на
Vercel: пустая сборка при `build.network`, 500 на `/categories/*` и пустой
YML-фид.
