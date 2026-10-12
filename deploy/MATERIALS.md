# Материалы («Мои материалы»): файлы и первая загрузка

Файлы материалов лежат на томе `ximishop-materials` (в контейнере api — `/app/api/materials`,
переменная `MATERIALS_DIR`). Из интернета они недоступны напрямую: только через API с проверкой
выдачи (сессия кабинета или секрет заказа). Каталог материалов — таблица `learning_materials`.

## Первая выкатка (три методички)

Порядок важен: пока скрипт не запущен, каталог пуст и оплаты ничего не выдают.

1. Деплой кода (мёрж в `main`) — миграция `AddLearningMaterials` применяется при старте.
2. Положить файлы в том. Имена фиксированы: `himichka.pdf`, `elektrohimichka.pdf`, `oge-2026.pdf`.

```bash
cd /opt/ximishop/app
C="docker compose --env-file deploy/web.env -f deploy/docker-compose.yml"

# каталог с тремя PDF лежит на сервере, например /root/materials-src
docker run --rm -v ximishop_ximishop-materials:/m -v /root/materials-src:/src:ro alpine \
  sh -c 'cp /src/himichka.pdf /src/elektrohimichka.pdf /src/oge-2026.pdf /m/ && chmod 644 /m/*.pdf && ls -l /m'
```

3. Dry-run, затем запись (скрипт идемпотентен; в отчёте — сколько материалов заведено, какие файлы
   и slug не найдены, сколько выдач добавлено уже оплаченным заказам):

```bash
$C exec -T ximishop-api node api/dist/seeds/apply-materials-methodichki.js --dry-run 2>&1 | tee -a /root/backups/card-seeds.log
$C exec -T ximishop-api node api/dist/seeds/apply-materials-methodichki.js 2>&1 | tee -a /root/backups/card-seeds.log
```

Ожидаемое предупреждение: `vse-chetyre-nabora` нет в каталоге — это нормально, пока товар не заведён.

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
