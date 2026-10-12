# «Мои материалы» — ядро (этап 1)

Дата: 12.10.2026. Статус: на ревью.

## Зачем

После оплаты набора покупатель должен получать соответствующую электронную методичку: Химичка 3.0 / Мини-Химичка,
Электрохимичка, Химичка ОГЭ. Раздавать планируется не только методички, поэтому делаем общий модуль «материалов»:
каталог в БД, закрытая раздача файлов, выдача при оплате, раздел «Мои материалы» в кабинете и блок на странице
«спасибо».

Решения владельца (чат, 12.10.2026):

- раздел кабинета называется «Мои материалы»; блока методичек внутри каждого заказа нет;
- закрытая раздача (файлы не лежат в публичной статике и не в git);
- после отмены или возврата заказа доступ остаётся, отзыв только вручную (этап 2);
- гости получают материал по ссылке со страницы заказа (токен заказа) и позже в кабинете (привязка по email).

Закрытый PR #103 (маппинг в коде + PDF в `web/public`) заменяется этой работой. Из него берём тесты, текст блока и
названия методичек.

## Границы

Входит в этап 1: схема БД, выдача при оплате, закрытое скачивание, раздел кабинета, блок на странице заказа, скрипт
заведения трёх методичек и выдачи уже оплаченным заказам, том для файлов.

Не входит: админка каталога и загрузка файлов (этап 2), выдача по email и отзыв выдач из админки (этап 2), личные
ссылки со сроком и лимитом (этап 3), уведомление клиенту о выдаче.

## Данные

Префикс `learning_` нужен, чтобы не пересечься с `material_leads` и `/get_materials` (форма «получить материалы по QR»).

`learning_materials`

| колонка                 | тип                           | примечание                                     |
| ----------------------- | ----------------------------- | ---------------------------------------------- |
| id                      | uuid PK                       |                                                |
| title                   | text not null                 | «Методичка «Химичка 3.0 / Мини-Химичка»»       |
| kind                    | text not null                 | `file` или `link` (CHECK)                      |
| file_key                | text null, unique             | имя файла в `MATERIALS_DIR`, только для `file` |
| file_name               | text null                     | имя для скачивания (`himichka-metodichka.pdf`) |
| mime_type               | text null                     |                                                |
| size_bytes              | bigint null                   |                                                |
| external_url            | text null                     | только для `link`                              |
| is_active               | boolean not null default true |                                                |
| created_at / updated_at | timestamptz                   |                                                |

CHECK: для `file` заполнен `file_key`, для `link` заполнен `external_url`.

`learning_material_products` — связь товар ↔ материал: `material_id`, `product_id`, составной PK, FK с `ON DELETE CASCADE`.
Шаблон сущности: `ProductCategoryLink`.

`material_grants`

| колонка     | тип              | примечание                                                       |
| ----------- | ---------------- | ---------------------------------------------------------------- |
| id          | uuid PK          |                                                                  |
| material_id | uuid FK          | `ON DELETE CASCADE`                                              |
| order_id    | uuid null FK     | `ON DELETE SET NULL`                                             |
| customer_id | uuid null FK     |                                                                  |
| email       | text null        | нижний регистр; по нему гостевая выдача привязывается при входе  |
| source      | text not null    | `order`, `admin`, `link` (CHECK); в этапе 1 используется `order` |
| revoked_at  | timestamptz null | отзыв вручную; в этапе 1 только колонка                          |
| created_at  | timestamptz      |                                                                  |

Индексы: уникальный частичный `(order_id, material_id) WHERE order_id IS NOT NULL` (идемпотентность выдачи за заказ);
`(customer_id)`; `(email)`.

Миграции — единственный источник схемы (в том числе для тестов): `api/src/migrations/<ms>-AddLearningMaterials.ts`,
шаблон `1790780000000-AddMaterialLeads.ts`; сущности регистрируются в массиве `api/src/config/dataSource.ts`.

## Выдача при оплате

Все пути оплаты (вебхук Т-Кассы, сверка, ручная смена статуса, YCP) сходятся в `writeOrderStatusEvent`
(`api/src/lib/notifications/outbox.ts`). Рядом с постановкой СДЭК и Метрики, под тем же условием
`order.status === 'paid' && previousStatus !== 'paid'`, вызывается `grantMaterialsForOrder(order)` в той же транзакции.

Это один `INSERT … SELECT … ON CONFLICT DO NOTHING`: для позиций заказа (подарочные тоже) берёт материалы из
`learning_material_products`, где `is_active`, и пишет `order_id`, `customer_id = order.customerId`,
`email = lower(order.customerEmail)` (если есть), `source = 'order'`. Повторный переход или повторный вызов ничего не
меняет.

Риск: ошибка вставки откатила бы запись оплаты. Смягчение: одна простая инструкция без ветвлений, покрыта тестами на
всех путях оплаты; миграции применяются при деплое до старта приложения.

Доступ после отмены или возврата сохраняется: выдача не удаляется и не отзывается автоматически.

Привязка гостевых выдач к аккаунту: `claimOrdersByEmail` (`api/src/lib/account/customers.ts`) дополняется
`UPDATE material_grants SET customer_id = $1 WHERE customer_id IS NULL AND email = $2`. Он уже вызывается при
подтверждении email и внутри `attachEmail`. Вход через Telegram без email ничего не привязывает, как и сейчас с заказами.

## Закрытая раздача

- Файлы лежат в `MATERIALS_DIR` (по умолчанию `/app/api/materials`) на отдельном томе `ximishop-materials`, вне
  `UPLOADS_DIR`, который раздаётся публично через `express.static`.
- Файл отдаётся потоком (`fs.createReadStream`) с `Content-Type` из `mime_type`, `Content-Length`,
  `Content-Disposition: attachment; filename*=UTF-8''…` и `Cache-Control: private, no-store`.
- `file_key` проверяется на путь: только базовое имя, итоговый путь обязан лежать внутри `MATERIALS_DIR`.
- Маршруты скачивания под `rateLimit`.

Кабинет (`requireCustomerAuth`):

- `GET /api/account/materials` — список материалов покупателя: выдачи с `customer_id = я`, `revoked_at IS NULL`,
  материал активен; по одному на материал (если выдан несколько раз — самая ранняя дата выдачи).
- `GET /api/account/materials/:materialId/download` — поток файла; материал должен быть выдан этому покупателю.
  Чужой, отозванный или неактивный — 404. Для `kind=link` — отдельного скачивания нет, клиент использует `url` из списка.

Страница заказа (гость и покупатель):

- `GET /api/public/orders/:number/status?t=` при верном токене и `paid`/`shipped` добавляет
  `materials: [{ id, title, kind, url? }]` (`url` только у `link`). Путей к файлам нет.
- `GET /api/public/orders/:number/materials/:materialId/download?t=` — поток файла; условия: верный токен, заказ
  оплачен, у заказа есть неотозванная выдача на этот материал.

Токен сравнивается через `timingSafeEqual`, как в существующем статусе заказа.

## Web

- Страница `account/(authed)/materials/page.tsx` «Мои материалы»; ссылка на неё с главной кабинета
  (`ProfileCard` / `AccountLink`). Клиент — `web/lib/accountApi.ts`.
- Блок «Ваши материалы» на `/order/[number]` — общий компонент `MaterialsDownloads` (тёмная тема страницы заказа),
  ссылки ведут на скачивание через API.
- Блока внутри заказов кабинета нет. Из-за этого `AccountOrderSummary` не меняется.
- Тип ответа статуса: `PublicOrderStatus.materials?: PublicOrderMaterial[]` (в `shared`).

## Три текущие методички

Одноразовый скрипт `api/src/seeds/apply-materials-methodichki.ts` (стиль `apply-*-card.ts`, запуск на сервере только по
команде владельца):

1. Проверяет наличие трёх файлов в `MATERIALS_DIR`: `himichka.pdf`, `elektrohimichka.pdf`, `oge-2026.pdf` — и берёт
   размер с диска.
2. Создаёт (upsert по `file_key`) три материала и привязывает к товарам:
   - Химичка 3.0 / Мини-Химичка → `himichka-30`, `mini-himichka`, `himichka-metodichka`;
   - Электрохимичка → `elektrohimichka`, `elektrometodichka`;
   - Химичка ОГЭ → `bolshoi-nabor-dlya-oge`;
   - комбо `himichka-i-elektrohimichka`, `vse-tri-nabora` получают материалы Химички и Электрохимички;
     `vse-chetyre-nabora` не в каталоге — слаг пропускается с предупреждением.
3. Выдаёт материалы уже оплаченным (`paid`/`shipped`) заказам с этими товарами.

Файлы кладёт владелец (по `scp` в том); в git PDF не попадают.

## Деплой

- `deploy/docker-compose.yml`: том `ximishop-materials`, монтирование в api, `MATERIALS_DIR` в `deploy/app.env.example`.
- Порядок выкатки: деплой кода и миграции → положить PDF в том → запустить скрипт → проверить заказ.
  До запуска скрипта у новых оплат выдача пустая (материалов в каталоге ещё нет), у старых заказов тоже.
- Caddy не меняется: `/api/*` уже уходит в api.

## Тесты

- shared: форма `PublicOrderMaterial`.
- api: `grantMaterialsForOrder` — идемпотентность, подарочные позиции, неактивный материал, заказ без материалов,
  гость с email.
- api: выдача срабатывает на путях оплаты (вебхук Т-Кассы, ручная смена статуса) и не срабатывает при непереходе в `paid`.
- api: `claimOrdersByEmail` привязывает гостевые выдачи.
- api: доступ к скачиванию — владелец, чужой покупатель, отозванная выдача, неактивный материал, нет токена, чужой
  токен, неоплаченный заказ; заголовки ответа; защита от выхода за `MATERIALS_DIR`.
- web: страница «Мои материалы» (пусто, список, ссылка), блок на странице заказа (оплачен / нет).
- Перед PR: `npm run lint`, `typecheck`, тесты затронутых workspace, `npx prettier --check .`, проверка в браузере и
  `/security-review` (токены, файлы, оплата).

## Что берём из #103

Тексты названий методичек, тесты порядка «купил → получил», компонент блока (переименовать в `MaterialsDownloads`).
Не переносим: маппинг в коде, `shared/src/types/methodichki.ts`, `web/public/methodichki`, правку матчера мидлвара.

## Открытые вопросы

Нет. Названия методичек в каталоге владелец может поправить скриптом до запуска.
