# SEO-запуск: серверная памятка

Порядок запуска импортов из PR с SEO-контентом на проде. Общий ранбук сервера —
[`README.md`](README.md), здесь только то, что нужно для этих импортов.

Пометки у команд:

- **[проверено локально]** — выполнено на одноразовой БД в раскладке, повторяющей
  рантайм-образ (`api/dist` + prod-зависимости, без `api/data` и без `tsx`);
- **[не проверено на сервере]** — зависит от docker, контейнеров и прод-данных,
  которых на ноутбуке нет. Эти команды повторяют образцы из `README.md` (раздел
  «Перенос картинок с Tilda»), но живьём не гонялись.

Подробности проверки и список непроверенного — в конце, раздел «Что проверено».

## Как запускать в контейнере

В рантайм-образе API лежат только скомпилированный `api/dist` и prod-зависимости.
Каталога `api/data` и `tsx` там нет, поэтому команды вида
`DATABASE_URL=… npm run import:… -w api` в контейнере не работают: они для
ноутбука с репозиторием. На сервере сиды запускаются скомпилированным `node`:

| Сид (npm-скрипт)                    | Команда в контейнере                              | Данные из `/app/api/data/` |
| ----------------------------------- | ------------------------------------------------- | -------------------------- |
| `import:cms-pages`                  | `node api/dist/seeds/import-cms-pages.js`         | `cms-pages.json`           |
| `migrate:tilda-images`              | `node api/dist/scripts/migrate-tilda-images.js`   | не обязательны (см. ниже)  |
| `import:seo-product-texts`          | `node api/dist/seeds/import-seo-product-texts.js` | `seo-product-texts.json`   |
| `import:seo-blog-drafts`            | `node api/dist/seeds/import-seo-blog-drafts.js`   | `seo-blog-drafts.json`     |
| `import:tilda-redirects` (не нужен) | `node api/dist/seeds/import-tilda-redirects.js`   | `tilda-redirects.csv`      |

Что установлено по коду и проверено запуском:

- **Точка входа.** У сидов нет проверки «main module»: `main()` вызывается прямо
  на верхнем уровне файла, так что `node api/dist/seeds/<имя>.js` работает как
  скрипт. У `migrate-tilda-images.js` проверка есть
  (`process.argv[1] === fileURLToPath(import.meta.url)`), и запуск
  `node api/dist/scripts/migrate-tilda-images.js` из `/app` её проходит.
- **Откуда данные.** Путь считается от `import.meta.url` скомпилированного файла:
  из `api/dist/seeds/` и `api/dist/seeds/_lib/` он приводит в `/app/api/data/`.
  Файла нет — сид падает с `ENOENT … /app/api/data/<файл>`, код выхода 1, в БД
  ничего не пишется.
- **Подключение к БД.** `DATABASE_URL` берётся из окружения контейнера
  (`deploy/app.env`, пользователь `ximishop_user`, хост `db`); `.env`-файла в
  контейнере нет и не нужен. TLS для хоста без точки выключается сам.
- **Рабочий каталог и пользователь.** `WORKDIR /app`, пользователь `node`:
  `$C exec -T ximishop-api node api/dist/…` ничего больше не требует.
- **Файлы данных доставляются в контейнер вручную.** Они лежат в гите, на сервере —
  в `/opt/ximishop/app/api/data/` (после автодеплоя). Копировать надо только
  нужные файлы, не весь каталог: `migrate-tilda-images` читает **все**
  `api/data/*.json`, и из `tilda-catalog.json`/`tilda-articles.json` в план
  попали бы лишние ссылки (по коду, `listDataFiles`). Каталог живёт в слое
  контейнера, а не в томе: при пересоздании контейнера (любой деплой) он
  пропадает. Не мёржить в `main` посреди серии; после серии каталог можно
  удалить (шаг 5).

Общая подготовка (дальше `$C` и `$P` используются во всех шагах):

```bash
cd /opt/ximishop/app
C="docker compose --env-file deploy/web.env -f deploy/docker-compose.yml"
P="docker exec -i supabase-db psql -U supabase_admin -d ximi4ka_shop"
mkdir -p /root/backups
```

## 0. Предпроверки: что уже есть на проде

Все запросы только читают. SQL проверен локально на одноразовой БД
**[проверено локально]**, запуск через `docker exec` — **[не проверено на сервере]**.

```bash
$P \
  -c "SELECT count(*) AS redirects FROM redirects;" \
  -c "SELECT slug, is_published, noindex, deleted_at IS NOT NULL AS deleted FROM pages ORDER BY slug;" \
  -c "SELECT column_name FROM information_schema.columns WHERE table_name='blog_posts' AND column_name LIKE 'author\_%' ORDER BY 1;" \
  -c "SELECT slug, is_published FROM blog_posts WHERE deleted_at IS NULL ORDER BY is_published DESC, slug;" \
  -c "SELECT count(*) AS tilda_product_images FROM product_images WHERE url LIKE '%tildacdn%';" \
  -c "SELECT count(*) FILTER (WHERE coalesce(trim(meta_title),'')='') AS empty_meta_title, count(*) FILTER (WHERE coalesce(trim(meta_description),'')='') AS empty_meta_description, count(*) FILTER (WHERE coalesce(jsonb_array_length(long_description_blocks),0)=0) AS no_long_description, count(*) AS total FROM products WHERE deleted_at IS NULL;" \
  -c "SELECT yml_shop_name, yml_company FROM site_settings;" \
  -c "SELECT name FROM migrations ORDER BY id DESC LIMIT 1;"
```

Что ожидаем увидеть и что из этого уже известно без доступа к серверу
(публичные запросы к `new.ximi4ka.ru` на 04.10.2026):

| Проверка                              | Ожидание перед запуском                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `redirects`                           | 84 и больше. Карта уже на проде: все 84 `from_path` из `tilda-redirects.csv` отвечают 301 на нужный `to_path`; `import:tilda-redirects` не нужен |
| `pages`                               | нет `policy`, `oferta`, `collab`, `cert`, `faq` (сейчас их URL отдают 404); если какая-то есть, сид её пропустит, не перезапишет                 |
| `author_*` в `blog_posts`             | 5 строк (`author_bio`, `author_job_title`, `author_name`, `author_photo_url`, `author_url`); публичный API блога уже отдаёт `authorName`         |
| `blog_posts`                          | 4 опубликованные статьи; есть ли среди них slug из `seo-blog-drafts.json` — покажет запрос                                                       |
| `tilda_product_images`                | около 70 (в `yml.xml` сейчас 70 ссылок на tildacdn)                                                                                              |
| `empty_meta_*`, `no_long_description` | 37 / 62 / 32 из 62 товаров (по публичному API; все 62 slug из `seo-product-texts.json` в каталоге есть, неизвестных не будет)                    |
| `yml_shop_name`, `yml_company`        | пусто: фид подставляет «Химичка» для обоих полей                                                                                                 |
| `migrations`                          | последняя — `AddBlogPostAuthor1790730000000`                                                                                                     |

Если `redirects` вдруг меньше 84 (чего по публичной проверке быть не должно) —
карта доливается тем же способом, что и остальные сиды, файл
`tilda-redirects.csv`; идемпотентно (upsert по `from_path`):

```bash
docker cp api/data/tilda-redirects.csv ximishop-api:/app/api/data/tilda-redirects.csv   # после mkdir из шага 2
$C exec -T ximishop-api node api/dist/seeds/import-tilda-redirects.js --dry-run
$C exec -T ximishop-api node api/dist/seeds/import-tilda-redirects.js
```

Этот вариант — **[проверено локально]** (84 строки, `created: 84`, повтор —
`updated`), на сервере не гонялся.

## 1. Бэкап БД и тома uploads

Образец — «Перенос картинок с Tilda» в `README.md`. **[не проверено на сервере]**
(формат `pg_dump -Fc` и `pg_restore -l` локально проверены).

```bash
docker exec supabase-db pg_dump -U supabase_admin -Fc ximi4ka_shop \
  > /root/backups/ximi4ka_shop.before-seo-launch.dump
docker run --rm -v ximishop_ximishop-uploads:/u -v /root/backups:/b alpine \
  tar czf /b/uploads.before-seo-launch.tgz -C /u .
ls -lh /root/backups/*before-seo-launch*
```

Дамп должен быть не пустым (порядка единиц мегабайт); проверка читаемости:

```bash
docker exec -i supabase-db pg_restore --list < /root/backups/ximi4ka_shop.before-seo-launch.dump | head -5
```

## 2. CMS-страницы (`import:cms-pages`)

Создаёт 11 страниц из `cms-pages.json`: `policy`, `oferta`, `collab`, `cert`,
`faq` и шесть служебных (`get_materials`, `xim3_inst`, `mx_inst`, `electroxim`,
`zhuk`, `socials`, они `noindex`). Создаются только отсутствующие по slug;
существующие, в том числе мягко удалённые, не трогаются. Страницы публикуются
сразу (`is_published = true`). Картинки в них остаются ссылками на tildacdn —
их заберёт шаг 3, поэтому порядок «2, потом 3».

```bash
docker exec -u 0 ximishop-api mkdir -p /app/api/data
docker cp api/data/cms-pages.json ximishop-api:/app/api/data/cms-pages.json

# dry-run: ничего не пишет
$C exec -T ximishop-api node api/dist/seeds/import-cms-pages.js --dry-run
# боевой запуск
$C exec -T ximishop-api node api/dist/seeds/import-cms-pages.js | tee -a /root/backups/seo-launch.log
```

Сам сид **[проверено локально]**. Dry-run печатает 11 строк вида
`/policy [paragraph:95]` и `Dry-run complete — no DB writes.`; боевой запуск
заканчивается строкой `"created":11,"skipped":0,"total":11` (повтор:
`"created":0,"skipped":11`). Без `cms-pages.json` падает с
`ENOENT: … /app/api/data/cms-pages.json`. Команды `mkdir`/`docker cp` —
**[не проверено на сервере]**.

Проверка (кеш витрины до минуты, если сразу 404 — повторить):

```bash
for p in policy oferta collab cert faq; do
  printf '/%s -> ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "https://new.ximi4ka.ru/$p"
done
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://new.ximi4ka.ru/policy2   # 301 https://new.ximi4ka.ru/policy
```

Ожидаем пять `200` и `301 https://new.ximi4ka.ru/policy`. Редирект `/policy2`
уже работает сейчас (проверено на публичном сайте), а вот `/policy`, `/oferta`,
`/collab` пока отвечают 404; страницы отдаёт API по `/api/public/pages/<slug>`
(локально все пять — 200). Ответ витрины (`200`) у `/cert`, `/faq` и у шести
служебных страниц, а также скорость обновления кеша — **[не проверено на
сервере]**.

## 3. Картинки (`migrate:tilda-images`)

Полное описание — «Перенос картинок с Tilda» в `README.md`. Скрипт качает
файлы (только GET) со `static|thb|optim.tildacdn.com` в `uploads/tilda/` и
переписывает ссылки в БД одной транзакцией; идемпотентен.

```bash
# dry-run: план без скачивания и записи
$C exec -T ximishop-api node api/dist/scripts/migrate-tilda-images.js

# бэкап прямо перед записью (если после шага 1 прошло время или были заказы)
docker exec supabase-db pg_dump -U supabase_admin -Fc ximi4ka_shop \
  > /root/backups/ximi4ka_shop.before-tilda-images.dump

# запись
$C exec -T ximishop-api node api/dist/scripts/migrate-tilda-images.js --apply | tee /root/backups/seo-launch-images.log
```

Dry-run **[проверено локально]**: без `api/data` и без ссылок в БД печатает
`Уникальных ссылок: 0`; на БД с каталогом и CMS-страницами из шагов выше нашёл
80 уникальных ссылок и показал колонки (`product_images.url`, `pages.blocks`,
`blog_posts.cover_image_url`, `blog_posts.blocks`). Запись `--apply` на
реальный tildacdn локально не запускалась (это скачивание сторонних файлов);
логика записи покрыта тестами репозитория
(`migrate-tilda-images.test.ts`, `…db.test.ts`: 23 теста проходят).
**`--apply` на сервере — не проверено.**

Если в отчёте есть строка `ОШИБКИ (N)` или код выхода 1 — повторить `--apply`
позже: перенесённое повторно не качается. Если `--apply` падает с `EACCES` на
`/app/api/uploads/tilda` (том создан с владельцем root) — **[не проверено на
сервере]**:

```bash
docker exec -u 0 ximishop-api chown -R node:node /app/api/uploads
```

Проверка (витрина подхватит ссылки за ~минуту, ISR 60 с):

```bash
$P -Atc "SELECT count(*) FROM product_images WHERE url LIKE '%tildacdn%'"   # ждём 0
$P -Atc "SELECT count(*) FROM pages WHERE blocks::text ~* 'tildacdn'"        # ждём 0
curl -s https://new.ximi4ka.ru/yml.xml | grep -c tildacdn                    # ждём 0 (сейчас 70)
$C exec -T ximishop-api node api/dist/scripts/migrate-tilda-images.js         # в отчёте нет блока «Колонки БД со ссылками на tildacdn»
```

## 4. SEO-тексты товаров (`import:seo-product-texts`)

Заполняет **только пустые** `meta_title`, `meta_description` и длинное описание
(с FAQ) по slug; всё заполненное, в том числе правки из админки, не
перезаписывается. Все 62 записи в `seo-product-texts.json` помечены
`draft: true`, поэтому без `--include-drafts` сид ничего не запишет
(`filledProducts: 0, drafts: 62`). Ключ `--append-long-description` нужен для
10 товаров, у которых длинное описание уже есть: SEO-блоки дописываются после
него.

**Два предупреждения.**

1. **Повторные запуски с `--append-long-description` безопасны** (исправлено в PR #38,
   сравнение блоков больше не зависит от порядка ключей jsonb). Проверять результат
   повторным dry-run: ждём `filledProducts: 0`.
2. **После этого шага не запускать `import:tilda-catalog`.** Он каждый раз
   перезаписывает `short_description` и `long_description_blocks` (и `metaTitle`,
   если он есть в JSON-каталоге) данными из `tilda-catalog.json`. Локально: после
   SEO-импорта у товара было 23 блока описания, после `import:tilda-catalog` — 1.
   В контейнере для него к тому же нужны `tilda-catalog.json` и запись в
   `api/data`, а каталог создан от root.

```bash
docker cp api/data/seo-product-texts.json ximishop-api:/app/api/data/seo-product-texts.json

# снимок трёх полей для точечного отката (см. раздел 8)
$P -c "CREATE TABLE seo_rollback_products AS SELECT id, meta_title, meta_description, long_description_blocks FROM products;"

# dry-run: БД читается, не пишется. Итог — последняя строка (filledProducts / untouchedProducts)
$C exec -T ximishop-api node api/dist/seeds/import-seo-product-texts.js --dry-run --include-drafts | tail -n 1
$C exec -T ximishop-api node api/dist/seeds/import-seo-product-texts.js --dry-run --include-drafts --append-long-description | tail -n 1

# боевой запуск ОДИН РАЗ; вывод сохранить: по нему делается откат
$C exec -T ximishop-api node api/dist/seeds/import-seo-product-texts.js --include-drafts --append-long-description \
  | tee /root/backups/seo-product-texts.live.log | tail -n 1
```

Что показал локальный прогон **[проверено локально]** на БД, повторяющей прод
(37 пустых `meta_title`, 62 пустых `meta_description`, 32 без описания):

- без флагов: `filledProducts: 0, drafts: 62`;
- `--include-drafts`: `filledProducts: 62, untouchedProducts: 8`;
- `--include-drafts --append-long-description`: `filledProducts: 62` (разница —
  10 дописываемых описаний);
- боевой запуск: `filledProducts: 62`, затем пустых `meta_title` и
  `meta_description` — по 0, без описания осталось 30;
- вывод dry-run — по строке JSON на каждый товар
  (`"slug":"himichka-30","fields":["metaTitle","metaDescription"],"msg":"would fill"`).

Проверка после боевого запуска:

```bash
# 1) дозаполнять нечего: ждём filledProducts 0
$C exec -T ximishop-api node api/dist/seeds/import-seo-product-texts.js --dry-run --include-drafts --append-long-description | tail -n 1
# 2) в БД пустых мета-полей не осталось
$P -c "SELECT count(*) FILTER (WHERE coalesce(trim(meta_title),'')='') AS empty_meta_title, count(*) FILTER (WHERE coalesce(trim(meta_description),'')='') AS empty_meta_description FROM products WHERE deleted_at IS NULL;"
# 3) на витрине (кеш ~минута): новый <title> и description
curl -s https://new.ximi4ka.ru/product/himichka-30 | grep -o '<title>[^<]*</title>'
curl -s https://new.ximi4ka.ru/product/himichka-30 | grep -o '<meta name="description"[^>]*>'
```

Ожидаем `filledProducts: 0`, нули в запросе и `<title>`, содержащий
`Купить набор Химичка 3.0 161 в 1 | Набор юного химика` (это `metaTitle` из
`seo-product-texts.json`; сейчас у товара `metaTitle` пуст и title другой:
«Набор химика для опытов Химичка 3.0 161 в 1»; суффикс бренда по шаблону
витрины, если он есть, может добавиться). Первые два пункта **[проверено локально]**, третий — только по
синтаксису, на публичном сайте до импорта.

## 5. Черновики статей (`import:seo-blog-drafts`)

Создаёт отсутствующие по slug статьи из `seo-blog-drafts.json` (10 штук)
**неопубликованными** (`is_published = false`, `published_at = NULL`): их видно
только в админке, на сайте и в sitemap они не появятся. Существующие статьи не
трогаются. Автор «Василий Аистов» записывается в новые статьи сразу. Если
черновики были импортированы раньше, чем появился автор, флаг
`--set-author-on-existing` дописывает пустые поля автора у уже существующих
статей из файла (заполненное не перезаписывает). Флаг безопасен и для чистого
запуска: он просто ничего не найдёт.

Нужна миграция `AddBlogPostAuthor1790730000000` (колонки `author_*`) — проверка
в шаге 0.

```bash
docker cp api/data/seo-blog-drafts.json ximishop-api:/app/api/data/seo-blog-drafts.json

# dry-run: покажет would create / exists, kept / would set author
$C exec -T ximishop-api node api/dist/seeds/import-seo-blog-drafts.js --dry-run --set-author-on-existing
# боевой запуск
$C exec -T ximishop-api node api/dist/seeds/import-seo-blog-drafts.js --set-author-on-existing \
  | tee -a /root/backups/seo-launch.log | tail -n 20
```

**[проверено локально]**: dry-run — 10 строк `would create  /blog/<slug>` и
`"created":10,"skipped":0,"authorFilled":0,"dryRun":true`; боевой —
`"created":10`; повтор — `"created":0,"skipped":10`. Сценарий «черновики есть,
автор пуст» (у двух статей обнулён `author_name`): dry-run и боевой запуск с
флагом печатают `would set author` / `author set` для этих двух и
`"authorFilled":2`. После запуска в БД 10 новых статей с `is_published = f` и
автором «Василий Аистов», 4 прежние опубликованные не тронуты.

Проверка:

```bash
$P -c "SELECT is_published, count(*) AS posts, count(author_name) AS with_author FROM blog_posts WHERE deleted_at IS NULL GROUP BY 1;"   # f: 10/10, t: 4/0 (авторов у старых нет — норма)
curl -s 'https://new.ximi4ka.ru/api/public/blog?limit=50' | grep -o '"slug":"[^"]*"' | wc -l                                              # 4: черновики публично не видны
```

Уборка после серии (каталог данных в контейнере больше не нужен):

```bash
docker exec -u 0 ximishop-api rm -rf /app/api/data
```

**[не проверено на сервере]**: `docker cp` / `rm` и запуск через `docker compose
exec`. Второй запрос **[проверено только по синтаксису]** на публичном API (до
импорта выдаёт 4).

## 6. Ручные шаги в админке и кабинетах

Это делает владелец, скриптами не закрывается.

1. **Вычитать тексты до публикации.** Все SEO-тексты — черновики автора кода, не
   проверенные владельцем:
   - товары: 62 карточки (title, description, длинное описание и FAQ у 10);
     правки — в админке, повторный сид их не перезапишет;
   - CMS-страницы `policy` и `oferta` — юридические тексты, перенесённые с Tilda:
     сверить реквизиты, контакты и актуальность; страницы уже опубликованы;
   - 10 статей-черновиков: прочитать, поправить и опубликовать вручную в админке
     (сид ничего не публикует). Автор в них — «Василий Аистов»; должность, био,
     фото и ссылку на автора в данные не вписаны, их при желании заполнить в
     админке (E-E-A-T).
2. **Фид YML.** Админка → Настройки → «YML-фид»: поля «Название магазина»
   (`yml_shop_name`) и «Юр. лицо» (`yml_company`). Пока они пусты, в `<name>` и
   `<company>` подставляется «Химичка» (так сейчас в `yml.xml`). Для Яндекс
   Маркета в `<company>` нужно юрлицо. Проверка:
   `curl -s https://new.ximi4ka.ru/yml.xml | head -n 8`.
3. **`llms.txt` заполнять не нужно.** Если поле «llms.txt» в настройках пустое
   (так по умолчанию), `/llms.txt` строится сам из каталога, блога и CMS-страниц.
   Заполнять вручную только если нужен собственный текст: он отдаётся как есть.
4. **Яндекс.Метрика.** В интерфейсе счётчика:
   - Цели → Добавить цель → «JavaScript-событие», идентификаторы ровно такие:
     `add_to_cart`, `open_cart`, `begin_checkout`, `purchase`
     (источник — `METRIKA_GOALS` в `web/lib/metrika.ts`);
   - Настройка счётчика → «Электронная коммерция»: включить, контейнер данных
     `dataLayer`, валюта RUB (витрина кладёт события в `window.dataLayer`);
   - ID счётчика задаётся в админке (Настройки → «Яндекс.Метрика (ID счётчика)»)
     или через `NEXT_PUBLIC_METRIKA_ID`.
5. **Директ: не включать оплату за конверсии по цели `purchase`.** Цель
   отправляется из браузера покупателя (по снимку корзины, сохранённому при
   оформлении): заказ без онлайн-оплаты засчитывается сразу после оформления, а
   покупка, страницу которой открыли в другом браузере или устройстве, не
   засчитывается вовсе. Для оплаты по конверсиям такая цель не годится; для
   отчётов и обучения стратегий можно.

## 7. Переключение апекса

Только ссылки и чек-лист. Полный порядок и готовый текст `robots.txt` — в
[`README.md`](README.md), раздел «Открытие для индексации при переключении
апекса» (и «Автодеплой» для передеплоя без коммита). Не дублировать сюда.

До переключения (всё уже сделано шагами 2–5 и 6):

- [ ] Редиректы с путей Tilda на месте (84 штуки, цели `/policy`, `/oferta`,
      `/collab` отвечают 200 — шаг 2).
- [ ] Картинки перенесены: в `yml.xml` и БД нет `tildacdn` (шаг 3).
- [ ] Тексты товаров и CMS вычитаны (шаг 6).

В момент переключения (по разделу в `README.md`):

- [ ] `NEXT_PUBLIC_SITE_URL=https://ximi4ka.ru` в `deploy/web.env` и передеплой
      web: canonical, sitemap и JSON-LD строятся от этой переменной, вшитой в
      сборку.
- [ ] `robots.txt` в админке заменён на текст из раздела; в нём одна строка
      `Sitemap: https://ximi4ka.ru/sitemap.xml`.

После переключения:

- [ ] Канонические URL на новом домене:
      `curl -s https://ximi4ka.ru/product/himichka-30 | grep -o '<link rel="canonical"[^>]*>'`
      (должен быть `https://ximi4ka.ru/...`, не `new.`).
- [ ] `curl -s https://ximi4ka.ru/robots.txt` — текст из раздела, одна строка
      `Sitemap:`; «Анализ robots.txt» в Яндекс.Вебмастере.
- [ ] `curl -s https://ximi4ka.ru/sitemap.xml | grep -c '<loc>'` — число адресов
      (сейчас на `new.` их 78); sitemap добавлен в Яндекс.Вебмастер и Google
      Search Console.
- [ ] Старые адреса Tilda отдают 301 на новые (выборочно, как в шаге 2).
- [ ] Яндекс Бизнес (карточка организации): адрес сайта.
- [ ] Bing Webmaster Tools: сайт добавлен (можно импортом из Search Console),
      sitemap отправлен.
- [ ] Смена пароля админки (раздел «Сразу после переключения DNS»).

Команды проверки canonical, `robots.txt` и `sitemap.xml` по синтаксису
проверены на `new.ximi4ka.ru`; на апексе — **[не проверено на сервере]**
(апекс пока на Tilda).

## 8. Откат по шагам

Ни один из импортов не удаляет данные, поэтому откат — это возврат записей,
которые они создали или заполнили. Универсальный откат — восстановление всей БД
из дампа шага 1 при остановленном api (теряются заказы, оформленные после дампа,
поэтому в тихое время и только если точечные откаты ниже не подходят):

```bash
$C stop ximishop-api
docker cp /root/backups/ximi4ka_shop.before-seo-launch.dump supabase-db:/tmp/before.dump
docker exec supabase-db pg_restore -U supabase_admin -d ximi4ka_shop --clean --if-exists --no-owner /tmp/before.dump
$C start ximishop-api
```

**[не проверено на сервере]**, образец — «Откат» в разделе про картинки
`README.md`.

Точечные откаты (SQL **[проверено локально]**, запуск через `$P` — не проверено
на сервере):

| Шаг                     | Что восстанавливается и чем                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2. CMS-страницы         | Удалить созданные страницы — только если по шагу 0 их до импорта не было (список созданных — в выводе сида): `$P -c "DELETE FROM pages WHERE slug IN ('policy','oferta','collab','cert','faq','get_materials','xim3_inst','mx_inst','electroxim','zhuk','socials');"`. Не удалять мягко: сид пропускает и мягко удалённые страницы, повторный импорт их не вернёт.                                                                                                                                                                        |
| 3. Картинки             | Только из дампа (`before-tilda-images`, команды в разделе про картинки `README.md`). Скачанные файлы в томе безвредны и ничего не ломают, ссылки на Tilda живы, пока жива подписка.                                                                                                                                                                                                                                                                                                                                                       |
| 4. SEO-тексты товаров   | Вернуть три поля из снимка шага 4: `$P -c "UPDATE products p SET meta_title = b.meta_title, meta_description = b.meta_description, long_description_blocks = b.long_description_blocks FROM seo_rollback_products b WHERE p.id = b.id AND (p.meta_title, p.meta_description, p.long_description_blocks) IS DISTINCT FROM (b.meta_title, b.meta_description, b.long_description_blocks);"` Правки, сделанные в админке после запуска, у этих трёх полей тоже откатятся. Когда снимок не нужен: `$P -c "DROP TABLE seo_rollback_products;"` |
| 5. Черновики статей     | Удалить созданные неопубликованные: `$P -c "DELETE FROM blog_posts WHERE is_published = false AND slug IN ('dlya-chego-ispolzuetsya-sernaya-kislota','s-chem-reagiruet-sernaya-kislota','gidroksid-natriya-chto-eto','permanganat-kaliya-chto-eto','fenolftalein-chto-eto','s-chem-reagiruet-azotnaya-kislota','azotnaya-kislota-dlya-chego-ispolzuetsya','chashka-petri-chto-eto','chem-zanyat-rebenka-doma','eksperimenty-dlya-detej-doma');"`                                                                                          |
| 5. Автор у существующих | Только для slug из строк `author set` вывода сида: `$P -c "UPDATE blog_posts SET author_name=NULL, author_job_title=NULL, author_bio=NULL, author_url=NULL, author_photo_url=NULL WHERE slug IN ('<slug>');"`                                                                                                                                                                                                                                                                                                                             |
| 6. Админка, Метрика     | Настройки YML очищаются в админке (фид вернётся к «Химичка»); цели и «Электронная коммерция» — в интерфейсе Метрики.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 7. Апекс                | Вернуть `robots.txt` на `User-agent: *\nDisallow: /` и `NEXT_PUBLIC_SITE_URL` на `https://new.ximi4ka.ru` (см. «Откат» в разделе про индексацию `README.md`).                                                                                                                                                                                                                                                                                                                                                                             |

## Найдено

1. **`--append-long-description` был неидемпотентен на реальном Postgres.** Защита сравнивала
   `JSON.stringify` блоков, а jsonb хранит ключи в другом порядке, поэтому повторные запуски
   дописывали SEO-блоки заново. **Исправлено в PR #38** (`isDeepStrictEqual`, тест на круг через
   БД). Если вы всё же запускали версию до #38 больше одного раза, дубли откатываются
   снимком `seo_rollback_products` из шага 4.
2. **Команды `DATABASE_URL=… npm run import:… -w api`** из описаний PR с SEO-
   импортами в контейнере не работают (нет `tsx` и `api/data`); вместо них —
   таблица в начале этой памятки. Это не дефект кода: скомпилированный запуск
   для всех сидов возможен без правок.
3. **`DEPLOY.md` называет карту редиректов «85 × 301»**, в
   `api/data/tilda-redirects.csv` 84 строки данных (плюс заголовок). Документ уже
   помечен устаревшим, правки не делались.

## Что проверено

Раскладка рантайм-образа смоделирована локально: `npm run build -w api`, затем
в чистой папке `api/dist`, `api/package.json`, корневой и `shared/package.json`,
зависимости — симлинки на `node_modules` репозитория, **без `api/data`**,
`cwd` = корень раскладки, `DATABASE_URL` на одноразовую БД с миграциями
(`npm run migration:run -w api`). Prod-зависимости при этом не отделялись
от dev-зависимостей, но `tsx` в запусках не участвует.

Выполнено: запуск каждого сида скомпилированным `node` без файла данных
(`ENOENT`, код выхода 1) и с файлом, `--dry-run` и боевой запуск, повтор,
сценарий `--set-author-on-existing`, dry-run `migrate-tilda-images`, SQL
предпроверок и откатов, `pg_dump -Fc` / `pg_restore -l`, публичные GET к
`new.ximi4ka.ru`. Для сидов с зависимостью от данных БД подготовлена
одноразовая БД через `import:tilda-catalog` и `import:tilda-articles`
(62 товара, 4 статьи, состояние совпало с продом по публичному API: 37 / 62 / 32).

**Нельзя проверить без сервера** (помечено в тексте): все вызовы `docker`
(`docker compose exec`, `docker exec -u 0`, `docker cp`, `docker run … tar`),
права на `/app/api/uploads` и `/app/api/data` в контейнере, `--apply` для
картинок на реальном tildacdn, запросы к `supabase-db` от `supabase_admin`
(названия колонок проверены на локальной БД с теми же миграциями), реальное
содержимое прод-БД (шаг 0), отдача страниц, ISR-кеш и `<title>` после импорта,
шаги в админке и кабинетах Метрики, Вебмастера, Search Console, Яндекс Бизнеса
и Bing, переключение апекса.
