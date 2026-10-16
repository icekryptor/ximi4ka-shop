# Материалы («Мои материалы»): файлы и первая загрузка

Файлы материалов лежат на томе `ximishop-materials` (в контейнере api — `/app/api/materials`,
переменная `MATERIALS_DIR`). Из интернета они недоступны напрямую: только через API с проверкой
выдачи (сессия кабинета или секрет заказа). Каталог материалов — таблица `learning_materials`.

## Первая выкатка (три методички)

Порядок важен: пока скрипт не запущен, каталог пуст и оплаты ничего не выдают.

1. Деплой кода (мёрж в `main`). Миграция `AddLearningMaterials` применяется не при старте, а шагом
   «→ миграции» в `deploy/deploy.sh` — уже ПОСЛЕ того, как новый контейнер api поднялся и стал healthy.
   Поэтому: (а) мёржить в тихий час; (б) сразу после мёржа открыть лог деплоя и убедиться, что шаг
   «→ миграции» прошёл без ошибки; (в) если он упал — оплаты не проходят, пока это не исправлено:
   либо чинить миграцию, либо немедленно откатывать деплой.

   **Риск окна деплоя.** От `docker compose up -d` до конца шага «→ миграции» (около 15–30 с) новый код
   работает на старой схеме БД, таблицы `material_grants` ещё нет:
   - каждый переход заказа `pending → paid` падает с `relation "material_grants" does not exist` внутри
     транзакции оплаты — запись оплаты откатывается (вебхук Т-Кассы получает 500 и повторяет; ответ YCP
     `/checkout/placed` тоже падает);
   - каждый `GET /api/public/orders/:n/status?t=` отвечает 500, страница «Спасибо за заказ» показывает
     ошибку сети.

   Если миграция упала — это окно не закрывается само, все записи оплаты падают до исправления (так уже
   бывало при упавшей миграции деплоя). Смягчение вне этой ветки: запускать миграции в `deploy.sh` новым
   образом ДО `up -d`.

2. Положить файлы в том. Имена фиксированы: `himichka.pdf`, `elektrohimichka.pdf`, `oge-2026.pdf`.

```bash
cd /opt/ximishop/app
C="docker compose --env-file deploy/web.env -f deploy/docker-compose.yml"

# каталог с тремя PDF лежит на сервере, например /root/materials-src
docker run --rm -v ximishop_ximishop-materials:/m -v /root/materials-src:/src:ro alpine \
  sh -c 'cp /src/himichka.pdf /src/elektrohimichka.pdf /src/oge-2026.pdf /m/ && chmod 644 /m/*.pdf && ls -l /m'
```

3. Dry-run, затем запись (скрипт идемпотентен; в отчёте — сколько материалов заведено, какие файлы
   и slug не найдены, сколько выдач добавлено уже оплаченным заказам). Через `| tee` код выхода
   скрипта теряется, поэтому после каждой команды печатается `exit=…`:

```bash
$C exec -T ximishop-api node api/dist/seeds/apply-materials-methodichki.js --dry-run 2>&1 | tee -a /root/backups/card-seeds.log; echo "exit=${PIPESTATUS[0]}"
# смотрим отчёт: missingFiles и missingSlugs — и только потом реальный запуск
$C exec -T ximishop-api node api/dist/seeds/apply-materials-methodichki.js 2>&1 | tee -a /root/backups/card-seeds.log; echo "exit=${PIPESTATUS[0]}"
```

Перед реальным запуском прочитать в отчёте dry-run поля `missingFiles` (PDF нет на томе) и
`missingSlugs` (товара с таким slug нет в каталоге). `exit=1` значит, что хотя бы одного PDF не
хватило: в реальном запуске остальные материалы при этом уже записаны, а пропущенные нужно
добавить на том и запустить скрипт повторно. Ожидаемое предупреждение про `vse-chetyre-nabora`
(товара нет в каталоге) код выхода не меняет — это нормально, пока товар не заведён.

4. Проверка в БД:

```bash
docker exec -i supabase-db psql -U supabase_admin -d ximi4ka_shop -At \
  -c "SELECT file_key, size_bytes, is_active FROM learning_materials ORDER BY file_key;" \
  -c "SELECT count(*) FROM material_grants;"
```

5. Проверка вживую: открыть страницу оплаченного заказа со ссылкой `#t=…` (блок «Ваши материалы»)
   и кабинет `/account/materials`; файл должен скачиваться, прямой адрес `/uploads/...` не существует.

## Откат

Удаление материала каскадом убирает его связи и выдачи:

```sql
DELETE FROM learning_materials WHERE file_key IN ('himichka.pdf', 'elektrohimichka.pdf', 'oge-2026.pdf');
```

Файлы на томе остаются; повторный запуск скрипта вернёт материалы и выдачи.

## Бэкап

Том `ximishop-materials` нужно бэкапить так же, как `ximishop-uploads` (см. `deploy/README.md`).

```bash
docker run --rm -v ximishop_ximishop-materials:/m -v /root/backups:/b alpine \
  tar czf /b/materials.$(date +%F).tgz -C /m .
```
