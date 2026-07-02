# Деплой new.ximi4ka.ru — ранбук

Витрина запускается на **new.ximi4ka.ru** параллельно с Tilda (апекс остаётся на Tilda до готовности checkout). Три сервиса:

| Сервис | Что | Куда | Конфиг |
|---|---|---|---|
| web | Next.js 16 (витрина + админка) | Vercel (team blockhead_dev), домен `new.ximi4ka.ru` | Root Directory: `web`, остальное zero-config |
| api | Express + TypeORM (long-lived) | Railway, проект `dependable-stillness` (рядом с `ximi4ka_finance`) | Root: `/`, Dockerfile Path: `api/Dockerfile` |
| db | PostgreSQL 17 | Supabase, новый проект (eu-central-1) | `DATABASE_URL` из Supabase → Railway env |

## Предварительно (владелец)

1. GitHub: создать приватный репо `ximi4ka-shop`, добавить remote и запушить `main`.
2. Supabase: новый проект (eu-central-1). Взять `DATABASE_URL` (session pooler, порт 5432 — TypeORM держит длинные коннекты) и ключи Storage.
3. Railway: account-токен, создать сервис из GitHub-репо.
4. DNS: CNAME `new` → `cname.vercel-dns.com` (после создания Vercel-проекта).

## Порядок

### 1. БД (Supabase)
Миграции **не запускаются на старте сервера** (glob `src/migrations/*.ts` не работает из dist) — накатить вручную с локальной машины:
```bash
cd /Users/vasilijaistov/Desktop/continuum/ximi4ka-shop
DATABASE_URL='<supabase-url>' npm run migration:run -w api
```

### 2. Данные (идемпотентно, с локальной машины)
```bash
DATABASE_URL='<supabase-url>' npm run seed -w api                 # админ-юзер, базовые страницы (сменить пароль!)
DATABASE_URL='<supabase-url>' npm run import:tilda-catalog -w api -- --replace-dev-seed   # 62 товара, 5 категорий
DATABASE_URL='<supabase-url>' npm run import:tilda-articles -w api                        # 4 статьи блога
DATABASE_URL='<supabase-url>' npm run import:tilda-redirects -w api                       # 85 × 301
```

### 3. api → Railway
Сервис из GitHub-репо: Root `/`, Dockerfile `api/Dockerfile`. Env (см. `api/.env.example`):
`DATABASE_URL`, `ADMIN_SESSION_SECRET` (сгенерировать), `WEB_ORIGIN=https://new.ximi4ka.ru` (CORS), позже `SENTRY_DSN`, `SUPABASE_STORAGE_URL`+`SUPABASE_SERVICE_ROLE_KEY` (когда появится Storage-адаптер), `YANDEX_PAY_*` (фаза 4), `ERP_INBOUND_URL`+`ERP_SHARED_SECRET` (фаза 5).
Healthcheck: `/health`. Проверка: `curl https://<railway-домен>/health` → `{"ok":true}`.

⚠️ Загрузки медиа сейчас — LocalDiskStorage: до Storage-адаптера аплоады в админке живут на эфемерном диске Railway (пропадают при redeploy). Импортированные фото (`api/uploads/imported`, в git) — в образе, не пропадают.

### 4. web → Vercel
Новый проект из того же репо, Root Directory `web`. Env: `NEXT_PUBLIC_SITE_URL=https://new.ximi4ka.ru`, `NEXT_PUBLIC_API_URL=https://<railway-домен>`, `NEXT_PUBLIC_METRIKA_ID=101553685` (или через админку). Домен `new.ximi4ka.ru` + DNS CNAME.

### 5. Пока апекс на Tilda — держать noindex
В админке (`/admin` → Настройки → robots.txt) закрыть сайт от индексации, иначе весь каталог задублируется в индексе против Tilda. Снять noindex при переключении апекса.

### 6. Пост-деплой смоук
- `/` , `/categories/kits`, `/product/himichka-30`, `/blog`, `/blog/himiya-8-klass-programma` — 200, контент на месте;
- `/tproduct/342501029362-mini-himichka` → 301 `/product/mini-himichka` (и вариант с дрейфнувшим слагом того же id);
- `/sitemap.xml`, `/robots.txt`, `/yml.xml`, `/turbo.xml`, `/blog/rss.xml` — валидны;
- админка: логин, создание черновика статьи, ревизии;
- Lighthouse mobile главной/категории/товара — цель **≥90** (базлайн Tilda: 40/34).

## Известные хвосты перед переключением апекса
- Checkout + Яндекс Pay (фаза 4) — кнопка «Оформить заказ» пока ведёт в 404; ERP-inbound (фаза 5).
- CMS-страницы 1:1 с Tilda — список и объёмы: `api/data/cms-pages-todo.md` (faq, policy, oferta, o-nas, cert, collab, QR-пути `/xim3_inst` и др.).
- Supabase Storage адаптер + перезаливка картинок товаров с static.tildacdn.com.
- `web/middleware.ts` → конвенция `proxy` (deprecation Next 16).
