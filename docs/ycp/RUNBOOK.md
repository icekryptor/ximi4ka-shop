# YCP — «Купить в 1 клик» в Яндексе: запуск и откат

Спека: [`../superpowers/specs/2026-10-11-ycp-integration-design.md`](../superpowers/specs/2026-10-11-ycp-integration-design.md).
Протокол: [`ycp-api-spec-notes.md`](ycp-api-spec-notes.md), схема — `ycp-openapi-0.0.14.json`.
Все шаги на проде — только по команде владельца. Токены и пароли в репозиторий и чат не попадают.

## Окружение (`deploy/app.env`)

| Переменная                                                            | Что вписать                                                                                                                                                |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `YCP_API_TOKEN`                                                       | Не короче 32 символов: `openssl rand -hex 32`. То же значение — в поле «Токен доступа» кабинета YCP. Пусто или короче — все вызовы `/api/v1` получают 401. |
| `WEB_ORIGIN`                                                          | `https://new.ximi4ka.ru` — **обязательно**. Без него ссылки на товары и картинки в ответах Яндексу строятся от `http://localhost:3000` (`ycpSiteOrigin`).  |
| `YCP_WAREHOUSE_ID`                                                    | `msk-1` (не менять после «Обновить склады через YCP»)                                                                                                      |
| `YCP_WAREHOUSE_TITLE`, `YCP_WAREHOUSE_ADDRESS`, `YCP_WAREHOUSE_PHONE` | название, полный адрес и телефон склада отгрузки; любое поле пустое — методы со складом отвечают 500                                                       |
| `YCP_CDEK_TIMEOUT_MS`                                                 | не задавать (по умолчанию 3500 мс, допустимо 1–4000)                                                                                                       |
| `CDEK_ORDERS_ENABLED`                                                 | должно быть `true`, иначе для оплаченных заказов из Яндекса не создаётся отправка в СДЭК; нужны и боевые `CDEK_CLIENT_ID` / `CDEK_CLIENT_SECRET`           |

## Порядок запуска

Чек-лист по порядку: (а) колонки заранее → (б) мёрж → (в) env и перезапуск → (г) фид и флаги → (д) кабинет.

- [ ] **(а) До мёржа — колонки и таблица заранее.** `deploy.sh` переключает контейнеры раньше, чем гоняет миграции, а новый
      код читает `products.ycp_enabled` и `orders.source`. Миграция `AddYcpFields1790790000000` написана с
      `IF NOT EXISTS` и при деплое пройдёт как no-op. Сначала проверьте владельца таблиц (`deploy/README.md`, раздел
      «Блог: поля автора», шаг 1), затем выполните от `supabase_admin` (SQL — копия миграции):

  ```bash
  docker exec -i supabase-db psql -U supabase_admin -d ximi4ka_shop \
    -c 'ALTER TABLE products ADD COLUMN IF NOT EXISTS ycp_enabled boolean NOT NULL DEFAULT false;' \
    -c "ALTER TABLE orders ADD COLUMN IF NOT EXISTS source varchar(16) NOT NULL DEFAULT 'site';" \
    -c 'ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_session_id varchar(64);' \
    -c 'ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_order_id varchar(64);' \
    -c 'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_orders_external_session_id" ON orders (external_session_id) WHERE external_session_id IS NOT NULL;' \
    -c 'CREATE INDEX IF NOT EXISTS "IDX_orders_external_order_id" ON orders (external_order_id) WHERE external_order_id IS NOT NULL;' \
    -c 'CREATE TABLE IF NOT EXISTS ycp_pickup_points_snapshot (id smallint NOT NULL, entries jsonb NOT NULL, built_at timestamptz NOT NULL, CONSTRAINT "PK_ycp_pickup_points_snapshot" PRIMARY KEY (id), CONSTRAINT "CHK_ycp_pickup_points_snapshot_single" CHECK (id = 1));' \
    -c 'ALTER TABLE ycp_pickup_points_snapshot OWNER TO ximishop_user;'
  ```

- [ ] **(б) Мёрж PR** — только по явной команде владельца (мёрж в `main` = выкатка в прод). Пока `YCP_API_TOKEN` пуст,
      `/api/v1` отвечает 401, для покупателей сайта ничего не меняется. В логе деплоя —
      `миграция применена: AddYcpFields1790790000000`.
- [ ] **(в) Env и перезапуск.** Владелец вносит переменные из таблицы в `deploy/app.env` на сервере и выполняет
      `bash deploy/deploy.sh --no-pull`. В логе api — `ycp pickup points job started`, затем
      `ycp: пункты выдачи СДЭК обновлены — N`.
- [ ] **Smoke с боевыми ключами СДЭК до публикации.** Загрузка ПВЗ (`GET /v2/deliverypoints` с `size`/`page`) и
      `delivery/options` проверены только на заглушках, на настоящем СДЭК не проверены. Убедитесь, что в логе первого
      обновления нет ошибок СДЭК, и что ответ содержит данные (подставьте свой токен, настоящий в чат не слать):

  ```bash
  curl -s -H 'Authorization: Bearer <YCP_API_TOKEN>' \
    'https://new.ximi4ka.ru/api/v1/checkout/delivery/pickup_points?limit=2&offset=0'
  ```

- [ ] **(г) Фид и флаги.** Фид `https://new.ximi4ka.ru/yml.xml` перезагрузить в Яндекс Товарах. В админке отметить
      товары флагом «Купить в 1 клик через Яндекс» — по одному, после проверки. Правила Яндекса запрещают «едкие и
      взрывчатые вещества»: решение по каждому товару за владельцем. `is_checkout_enabled=true` в фиде и товар в
      `basket/check` — только у отмеченных.
- [ ] **Вес и габариты.** У товаров без `weightG` в фид уходят расчётные вес и габариты (вес по умолчанию + тара
      коробки) как настоящие данные. Перед включением флага внесите реальные веса.
- [ ] **(д) Кабинет YCP** (https://merchants.yandex.ru/ycp):
  - «Токен доступа» = `YCP_API_TOKEN`.
  - «URL для API» — хост магазина `https://new.ximi4ka.ru`, не апекс `ximi4ka.ru` (он ещё на Tilda). Нужен ли суффикс
    `/api/v1`, не проверено: сначала корень, нажать «Проверить подключение»; не прошло — с `/api/v1`.
  - Способы оплаты — «Только онлайн-оплата» (Яндекс Пэй / Сплит). Доставка — собственная (`merchant_ship`).
  - «Склады» → «Обновить склады через YCP» (вызывает `GET /api/v1/warehouses`).
  - Тестовый заказ: чек формируется, заказ в админке с отметкой «Яндекс», после оплаты в Telegram карточка, в СДЭК
    создан заказ. Затем «Опубликовать» (до 36 часов).

## Решить до публикации

- [ ] **НДС.** `vat` не передаём, Яндекс подставит 22 %. Подтвердите налоговый режим магазина и схему чеков
      (онлайн-касса Яндекса CloudKassir/АТОЛ или свои чеки) и допустимые значения `vat` у Яндекса.
- [ ] **Наличие в фиде.** Для товаров не в наличии фид отдаёт `available="false"`; документация Яндекс Товаров
      рекомендует только `available="true"`. Проверьте замечания валидации фида.
- [ ] **Возвраты не автоматизированы.** Платёж только онлайн: `payment_method: on_delivery` отклоняется 409 и шлёт
      менеджеру алерт `ycp:on_delivery`. Если Яндекс отменил уже оплаченный или отгруженный заказ, менеджеру приходит
      Telegram-алерт `ycp:cancel_after_ship`: отмените отправку в СДЭК вручную и проверьте возврат денег.
- [ ] Описания товаров без промо-слов («скидка», «акция», «хит») — проверить при модерации фида (не проверено).

## Известные ограничения

- `time_zone` пункта выдачи считается по долготе приблизительно: для Омска, Новосибирска, Владивостока и подобных
  регионов возможна ошибка на 1 час.
- Остаток — константа (в наличии = 99), реального учёта и резерва нет.

## Откат

- **Быстрый:** очистить `YCP_API_TOKEN` в `deploy/app.env` и перезапустить api (`bash deploy/deploy.sh --no-pull`).
  Все вызовы Яндекса получают 401, кнопка встанет на паузу на ближайшей технической проверке (раз в 8 часов),
  фоновая загрузка ПВЗ не стартует. Релиз не нужен.
- **Точечный:** снять флаг у товара в админке — в фиде `is_checkout_enabled=false`, в `basket/check` товар пропадает.
- **Полный:** выключить кнопку в кабинете YCP (до 8 часов). Код и колонки можно не трогать: старые заказы из Яндекса
  остаются в админке с отметкой «Яндекс».
