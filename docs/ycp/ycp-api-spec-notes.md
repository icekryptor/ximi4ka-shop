# YCP (Yandex Commerce Protocol) — merchant API: technical spec notes

Collected 2026-10-11 from the official docs. This file is a working reference for implementing the shop-side (merchant) API.

**Primary sources (all fetched in full as raw text, not via summarizer):**

- OpenAPI JSON (authoritative, 71.7 KB): https://yandex.ru/support/merchants-ru-ycp/ru/openapi/ycp-swagger.openapi.json — OpenAPI 3.0.3, `info.version` = `0.0.14`, `servers: [{"url":"api/v1"}]`
- Rendered spec: https://yandex.ru/support/merchants-ru-ycp/ru/openapi/index.md (+ per-endpoint `.md`, listed in https://yandex.ru/support/merchants-ru-ycp/ru/llms.txt)
- YCP intro: https://yandex.ru/support/merchants-ru-ycp/ru/index.md
- Buy button / cabinet setup: https://yandex.ru/support/merchants/ru/buy-button.md
- Adding products: https://yandex.ru/support/merchants/ru/product-add.md
- Shop requirements: https://yandex.ru/support/merchants/ru/requirement.md (page dated 04.09.2026)
- Feed: https://yandex.ru/support/merchants/ru/connect/form-feed.md, .../offers.md (simplified offer), .../export/vendor-model.md (arbitrary offer, NOT read in detail), .../features.md, .../connect/feed-load.md
- Microdata: https://yandex.ru/support/merchants/ru/microdata.md, .../website-offers.md

Marking convention: **UNVERIFIED** = not stated in the official docs; either inferred or an open question. "Spec" = OpenAPI JSON.

---

## 0. Big picture

- The **merchant implements** the HTTP API; **Yandex is the client**. The shop's server is called by Yandex.
- Base path: `/api/v1` (spec `servers[0].url` is the _relative_ string `api/v1`). The host is the "URL для API" entered in the YCP cabinet (see section 12). Whether the cabinet expects the site root or the `/api/v1` prefix included is **UNVERIFIED** (the docs say "укажите URL вашего сайта").
- Hard requirement: the shop server must answer **within 5 seconds** (spec `info.description`). Cabinet block reasons include `client_timeout`.
- All bodies are `application/json`. All endpoints are marked "Обязательный метод" (mandatory) except where noted as conditional below.
- Flow (spec `info.description`):
  1. Buyer goes to checkout / changes region / session conflict -> **POST /checkout/basket/check** (prices & stock).
  2. Buyer picks an address -> Yandex computes delivery either via delivery-service APIs or via the shop's **POST /checkout/delivery/options** (depends on integration settings).
  3. Buyer goes to payment -> **POST /checkout** (create session; re-check prices, reserve stock).
  4. Either **POST /checkout/cancel** (session abandoned after 1 hour or the buyer returned to editing the cart) or **POST /checkout/placed** (order placed).
  5. Later: **POST /order/cancel**, **POST /order/delivered**, **GET /order** (delivery history).

---

## 1. Authorization

- Header on every Yandex -> shop request: `Authorization: Bearer YOUR_TOKEN`.
- Spec `components.securitySchemes.bearerAuth`: `{"type":"http","scheme":"bearer","bearerFormat":"JWT"}`; description: "Bearer токен для авторизации. Токен настраивается в админ-панели модуля. Формат: `Bearer YOUR_TOKEN`."
- The shop **generates its own access token** ("Сгенерируйте токен доступа на стороне вашей интеграции или с помощью внешних сервисов") and pastes it into the YCP cabinet in the field **Токен доступа**. The shop compares the incoming header to that value. Format of the token is free (`bearerFormat: JWT` is a hint; not necessarily enforced) — **UNVERIFIED** whether a non-JWT opaque string is accepted. (buy-button.md, "YCP протокол (API)", steps 3–4.)
- Separately the cabinet shows **"Ваш API-токен"** (YCP -> used for the shop's own calls _to_ YCP). buy-button.md: "Токен доступа используется для авторизации запросов от вашего сайта к API YCP" (sic — wording on the page is ambiguous/contradictory with the spec; the spec says Yandex sends the token to the shop). The shop->YCP API is **not documented** in this spec — **UNVERIFIED** what it is used for in the plain-API integration.
- Failure: respond `401` with `{"error":"Unauthorized"}`.

## 2. Error format and status codes (common)

- Error body schema `Error`: `{"error": "<string>"}` (`error` optional string). Examples: `{"error":"Unauthorized"}`, `{"error":"Invalid request format: required fields are missing"}`, `{"error":"Failed to process request"}`.
- Reusable response components exist: `BadRequest` (400), `Unauthorized` (401), `ServerError` (500).
- The spec documents **no** retry policy, no idempotency keys, no request-id headers, no rate limits, no signature. All **UNVERIFIED**. Safe design assumption: every endpoint must be idempotent (keyed by `session_id` / `order_id`), since Yandex may re-send (the `409` on /checkout "сессия уже существует" implies at least duplicate-session handling).
- Cabinet "block reasons" (buy-button.md, "Кнопка не отображается"): automatic technical check **every 8 hours**; the button is paused when the shop returns:

| Code                      | Meaning                                                     |
| ------------------------- | ----------------------------------------------------------- |
| `no_stocks`               | zero stock for the product on all active warehouses         |
| `unactive_warehouses`     | no stock data received for the product on active warehouses |
| `invalid_response_format` | response in the wrong format                                |
| `client_5xx`              | shop server returned 5xx                                    |
| `client_404`              | shop server returned 404                                    |
| `client_timeout`          | response timeout                                            |
| `unknown`                 | other                                                       |

Consequence: 404 on `/checkout/basket/check` (spec lists "Товары не найдены") may trigger `client_404` blocking — **UNVERIFIED** whether a legitimate "product not found" 404 counts; be careful with which product ids the health-check uses.

---

## 3. Endpoint summary

| #   | Method + path                          | Mandatory?                                               | Success          | Error codes in spec     |
| --- | -------------------------------------- | -------------------------------------------------------- | ---------------- | ----------------------- |
| 1   | `GET /warehouses`                      | Yes                                                      | 200              | 401, 500                |
| 2   | `POST /checkout/basket/check`          | Yes                                                      | 200              | 400, 401, 404, 500      |
| 3   | `POST /checkout`                       | Yes                                                      | 201              | 400, 401, 409, 500      |
| 4   | `POST /checkout/placed`                | Yes                                                      | 200 (empty body) | 400, 401, 404, 409, 500 |
| 5   | `POST /checkout/cancel`                | Yes                                                      | 200 (empty body) | 400, 401, 404, 500      |
| 6   | `POST /order/cancel`                   | Yes                                                      | 200 (empty body) | 400, 401, 404, 500      |
| 7   | `POST /order/delivered`                | Yes **if Yandex manages delivery**                       | 200 (empty body) | 400, 401, 404, 409, 500 |
| 8   | `GET /checkout/delivery/pickup_points` | Yes **if you manage delivery AND support pickup points** | 200              | 401, 500                |
| 9   | `POST /checkout/delivery/options`      | Yes **if you manage delivery**                           | 200              | 400, 401, 500           |
| 10  | `GET /order`                           | Yes **if YCP delivery is connected**                     | 200              | 400, 401, 500           |

Note `/order/cancel`, `/order/delivered` and `GET /order` take `order_id` as a **query** parameter (not body), with `POST` for the first two (body only for `/order/delivered`).

---

## 4. Endpoint details

### 4.1 `GET /warehouses` — list warehouses and self-pickup points

Semantics: "Возвращает список складов и точек самовывоза магазина. Метод поддерживает пагинацию. Порядок складов в ответе определяет магазин." Cabinet: the "Обновить склады через YCP" button imports warehouses by calling this (buy-button.md, Step 3).

Query (both REQUIRED):

- `limit` integer — max warehouses in the response (example `1000`)
- `offset` integer — number to skip (example `0`)

200 body (`required: ["warehouses","total_count"]`):

- `warehouses` array<Warehouse> REQ
- `total_count` integer REQ — total warehouses of the shop

`Warehouse`:

- `id` string REQ (ex. `"1"`) — warehouse id; **these ids are reused** in basket/check `warehouses[].id` and `/checkout` `warehouse_id`
- `title` string REQ
- `address` string REQ — full address
- `phone` string REQ (ex. `"+7 (495) 123-45-67"`)
- `description` string opt
- `self_pickup_options` opt `{ "enabled": bool REQ, "schedule": opt }` — if `enabled=true`, `schedule` must be filled; if `false`, do not send `schedule`
  - `schedule`: `{ "restrictions": [ {"day": int 1..7 (1=Mon..7=Sun) REQ, "time_from": "HH:mm" REQ, "time_to": "HH:mm" REQ, "time_zone": int REQ (UTC offset hours, e.g. 3)} ] REQ }`. 24h: `time_from="00:00"`, `time_to="23:59"`.
- `ycp_delivery_options` opt `{ "enabled": bool REQ }` — "Доставка по YCP включена для склада, если доставка по протоколу YCP включена в разделе «Склады и логистика» настроек и выполняется одно из условий: enabled = true; поле не передано."

Example:

```json
{
  "warehouses": [
    {
      "id": "1",
      "title": "Основной склад",
      "address": "Москва, улица Примерная, 1",
      "phone": "+7 (495) 123-45-67",
      "self_pickup_options": {
        "enabled": true,
        "schedule": {
          "restrictions": [{ "day": 1, "time_from": "10:00", "time_to": "22:00", "time_zone": 3 }]
        }
      },
      "ycp_delivery_options": { "enabled": true }
    }
  ],
  "total_count": 10
}
```

Errors: 401 `{"error":"Unauthorized"}`; 500 `{"error":"Failed to process request"}`.
Who/when calls it: on demand from the cabinet ("Обновить склады через YCP") — exact schedule **UNVERIFIED**.

### 4.2 `POST /checkout/basket/check` — check the basket (prices and stock)

Semantics: "Проверяет наличие товаров на складах и возвращает актуальные цены." Called when the buyer goes to checkout, changes region, or on a session-creation conflict (409 from /checkout). Also used for **background health checks** (section 8) — at most one per 10 s.

Request (`BasketCheckRequest`, all 4 REQUIRED):

- `items` array<{`id` string REQ, `quantity` integer REQ}> — products to check
- `offers_id_from_merchant_center` boolean REQ — `true`: `items[].id` are feed `offer id`s; `false`: they are product ids as returned by this method
- `locality` string REQ (ex. `"Москва"`) — buyer region; "В ответе можно передавать региональные цены и остатки — только по складам соответствующего региона."
- `is_health_check` boolean REQ — background availability check; if `true` "не меняйте ответ — ни HTTP-код, ни тело ответа"

Example request: `{"items":[{"id":"50","quantity":2}]}` (spec example omits the other 3 required fields — spec inconsistency; send/accept them all, treat missing as defaults **UNVERIFIED**).

200 body: `{"items": [BasketItem]}` (`items` REQ).

`BasketItem` fields:

- `id` string REQ
- `name` string REQ
- `regular_price` integer REQ — price without discount
- `final_price` integer REQ — price after discount
- `vat` integer opt — VAT rate in percent, **default 22**
- `img` string(uri) opt
- `url` string(uri) opt — product page URL
- `warehouses` array REQ of `{ "id": string REQ, "available_quantity": integer REQ }` — stock per warehouse; "если интернет-магазин сам рассчитывает доставку, в ответе достаточно передать только склад — используйте ID складов из метода /warehouses". `available_quantity` = quantity the buyer can buy right now.
- `dimensions` object REQ `{width, height, depth: int mm; weight: int grams}` (all four optional inside)
- `characteristics` array<Characteristic> REQ (may be empty)
- `variations` array<BasketItemVariation> REQ (may be empty). `BasketItemVariation` = same fields as BasketItem **except it has no `variations`** (id, name, regular_price, final_price, vat, img, url, warehouses, dimensions, characteristics).

`Characteristic`: `{ "display_type": "color"|"text" REQ, "code": string REQ, "name": string REQ, "properties": REQ }`

- `display_type="text"` -> `properties: {"value": string}` (e.g. `"XXL"`)
- `display_type="color"` -> `properties: {"value": string (color name), "hex": string "#000000"}` (both REQ)
- characteristics that should be grouped must share the same `code` (e.g. `SIZES_CLOTHES`, `COLOR_REF`).

Variation rules (verbatim intent): the set of variations must be **symmetric/stable** — if product #1 lists variations #2 and #3, then requesting #3 must list #1 and #2.

Example response (abridged):

```json
{
  "items": [
    {
      "id": "50",
      "name": "Товар 1",
      "regular_price": 1999,
      "final_price": 1999,
      "img": "https://example.com/image.jpg",
      "url": "https://example.com/product/50",
      "warehouses": [{ "id": "1", "available_quantity": 10 }],
      "dimensions": { "width": 100, "height": 200, "depth": 50, "weight": 500 },
      "characteristics": [
        {
          "display_type": "text",
          "code": "SIZES_CLOTHES",
          "name": "Размер",
          "properties": { "value": "XXL" }
        }
      ],
      "variations": [
        {
          "id": "51",
          "name": "Товар 1",
          "regular_price": 2000,
          "final_price": 2000,
          "warehouses": [{ "id": "1", "available_quantity": 10 }],
          "dimensions": { "width": 100, "height": 200, "depth": 50, "weight": 500 },
          "characteristics": [
            {
              "display_type": "text",
              "code": "SIZES_CLOTHES",
              "name": "Размер",
              "properties": { "value": "M" }
            }
          ]
        }
      ]
    }
  ]
}
```

Errors: 400 `{"error":"Invalid request format: required fields are missing"}`; 401; 404 "Товары не найдены" (no example body); 500.
Open points (**UNVERIFIED**): which item to return for an unknown `id` (omit vs 404); whether out-of-stock items should be returned with `available_quantity: 0`; whether prices are rubles (examples + feed doc say rubles, integer) — assume integer rubles; `vat` allowed values not enumerated.

### 4.3 `POST /checkout` — create checkout session

Semantics: "Создает сессию оформления заказа." Recommended on handling: re-verify stock and prices, **reserve stock**, create-or-find the user by email/phone. Called when the buyer proceeds to payment. Session expires on Yandex side after **1 hour** (then /checkout/cancel).

Request `CreateCheckoutRequest` (all REQUIRED):

- `session_id` string (ex. `"019c18f6-cb3c-7f31-9395-53925a6b0e28"`, UUIDv7-looking)
- `warehouse_id` string — warehouse shipping the order
- `items` array<Item>: `{ "id": string REQ, "quantity": integer REQ, "regular_price": integer REQ, "final_price": integer REQ }`
- `customer`: `{ "full_name": string REQ, "phone": string REQ (ex "+79991234567"), "email": string(email) REQ }`
- `delivery` (`DeliveryInfo`):
  - `delivery_method` REQ enum `courier | pickup_point | self_pickup`
  - `service_type` REQ enum `yandex_delivery | cdek | pecom | russian_post | dalli | self_pickup | merchant_ship | ycp`
  - `service_display_name` opt string (ex. `"Яндекс.Доставка"`)
  - `price` number(float) REQ — delivery cost for the buyer
  - `address` REQ (`Address`, below)
  - `delivery_date_interval` REQ (`DeliveryDateInterval`, below)
  - `ycp_delivery_option_id` opt string — id of the option previously returned by `/checkout/delivery/options`
  - `delivery_notes` opt string — buyer comment for the courier

`Address` (all fields optional in schema; semantics): for `courier` and `self_pickup` **`locality` and `address` required**; for `pickup_point` **`pickup_point_id` required**. Fields: `locality` (region/city, ex "Москва"), `address` (street, house, building), `apartment`, `entrance`, `floor`, `intercom`, `pickup_point_id`.

`DeliveryDateInterval`: `{ "start_interval": DeliveryInterval REQ, "end_interval": DeliveryInterval REQ, "time_zone": integer REQ (UTC offset hours) }`; `DeliveryInterval`: `{ "date": "YYYY-MM-DD" REQ, "time": "HH:MM:SS" opt }`. (Spec examples for /checkout omit `time_zone` although marked REQ — treat it as possibly absent **UNVERIFIED**.)

Example (courier):

```json
{
  "session_id": "019c18f6-cb3c-7f31-9395-53925a6b0e28",
  "warehouse_id": "1",
  "items": [{ "id": "50", "quantity": 2, "regular_price": 1999, "final_price": 1999 }],
  "customer": { "full_name": "Иван Иванов", "phone": "+79991234567", "email": "ivan@example.com" },
  "delivery": {
    "delivery_method": "courier",
    "service_type": "yandex_delivery",
    "service_display_name": "Яндекс.Доставка",
    "price": 100,
    "address": {
      "locality": "Москва",
      "address": "ул. Тестовая, д. 1",
      "apartment": "10",
      "entrance": "2",
      "floor": "3",
      "intercom": "1234"
    },
    "delivery_date_interval": {
      "start_interval": { "date": "2025-04-16" },
      "end_interval": { "date": "2025-04-17" }
    }
  }
}
```

Example (pickup point): `delivery_method:"pickup_point"`, `address:{"pickup_point_id":"PP_12345","locality":"Москва","address":"ул. Тестовая, д. 1"}`, intervals with `time` e.g. `"10:00:00"`–`"14:00:00"`.

Responses:

- **201** `CreateCheckoutResponse`: `{ "order_number": string opt }` (ex. `"order1234"`) — shop's own order number shown to the buyer; if omitted, YCP uses its own sequential number. (So `{}` is a valid 201 body per schema; UNVERIFIED empirically.)
- **400** `Error`; **401** `Error`; **500** `Error`.
- **409** "Конфликт (сессия уже существует или изменились цены/наличие)" -> `CreateCheckoutSessionConflictResponse`:
  - `error` string opt (ex. `"Цены изменились или товары закончились"`)
  - `actual_inventory` opt `{ "items": [ {"id": string REQ, "regular_price": integer REQ, "final_price": integer REQ, "warehouses": [{"id": string REQ, "available_quantity": integer REQ}] REQ} ] REQ }`
  - `checkout_canceled` boolean opt — "Была ли сессия оформления заказа уже отменена"
    After a conflict Yandex re-calls `/checkout/basket/check`.

Idempotency: **UNVERIFIED**; schema implies the shop should answer 409 (not create a duplicate) for a repeated `session_id`, and `checkout_canceled` lets the shop say the session is already cancelled.

### 4.4 `POST /checkout/placed` — order placed notification

Semantics: Yandex calls it when the buyer has placed the order. `payment_method` tells whether it is paid online.

Params: query `session_id`, `order_id`, `payment_method` are present but marked **`deprecated: true`** (all required, query) — **use the JSON body**. Be tolerant: accept both.

Body `CheckoutPlacedRequest`:

- `session_id` string REQ
- `order_id` string REQ (ex. `"01996fd7-9a16-44aa-89ae-25cab68e0790"`) — **this is the id used by all /order/\* endpoints**
- `order_number` integer REQ — YCP order number, unique among all of this shop's YCP orders (note: integer here vs string `order_number` in /checkout response)
- `payment_method` string REQ enum `online | on_delivery` — online = already paid; on_delivery = pay on receipt
- `online_payment_method` string opt enum `card | sbp | split | split_sbp` (card / SBP / installments "Сплит" / split via SBP)
- `acquiring_id` string opt — payment transaction id; sent when `payment_method=online`

Examples: online `{"session_id":"...","order_id":"...","order_number":1234,"payment_method":"online","online_payment_method":"split","acquiring_id":"019b56d1-89a5-7a78-849f-4e8b174d0c77"}`; on_delivery `{"session_id":"...","order_id":"...","order_number":1234,"payment_method":"on_delivery"}`.

Responses: 200 (no body), 400, 401, 404 "Заказ не найден" (Error), 409 "Заказ уже отменен", 500.

### 4.5 `POST /checkout/cancel` — cancel a checkout session

Semantics: Yandex calls it when checkout was not completed: 1 hour passed since session creation, or the buyer returned to edit the cart. Shop should **release the stock reservation**.
Query: `session_id` string REQ.
Responses: 200 (empty), 400, 401, 404 "Сессия не найдена", 500.
(Cabinet text: "заказ не оплачен или не завершен — Яндекс отменит сессию, чтобы снять резерв".)

### 4.6 `POST /order/cancel` — cancel an order after placement

Semantics: "Яндекс вызывает этот метод, чтобы отменить заказ после его оформления."
Query: `order_id` string REQ. No body.
Responses: 200 (empty), 400, 401, 404 "Заказ не найден", 500.
Trigger reasons / whether a refund for online-paid orders is shop's responsibility: **UNVERIFIED**.

### 4.7 `POST /order/delivered` — mark order delivered

Mandatory only "если доставкой управляет Яндекс". Called after delivery to the buyer; the body lists **only the redeemed items** (if the buyer kept only part, only those appear).
Query: `order_id` string REQ.
Body `MarkAsDeliveredRequest`: `{ "purchased_items": [ {"id": string REQ, "quantity": integer REQ} ] REQ }`. Example `{"purchased_items":[{"id":"50","quantity":2}]}`.
Responses: 200 (empty), 400, 401, 404 "Заказ или товар не найден", 409 "Заказ уже отменен", 500.

### 4.8 `GET /checkout/delivery/pickup_points` — pickup point list

Mandatory if **you** manage delivery and support delivery to pickup points. Pagination order is determined by the shop.
Query (REQUIRED): `limit` integer (ex 1000), `offset` integer (ex 0).
200 `GetPickupPointsResponse`: `{ "pickup_points": [PickupPoint] REQ, "total_count": integer REQ }`.
`PickupPoint`:

- `id` string REQ (ex "PP001") — unique; this is `pickup_point_id`
- `name` string REQ
- `address` string REQ
- `has_fitting` boolean opt
- `is_cash_available` boolean REQ
- `is_card_available` boolean REQ
- `working_hours` REQ `WorkingHours`: optional string keys `mon,tue,wed,thu,fri,sat,sun`, format `"09:00-21:00"` (the example uses en dash `09:00–21:00`; docs say hyphen); 24h = `"00:00-23:59"`; **omit the key for a non-working day**
- `coordinates` REQ `{ "lat": number REQ, "lon": number REQ }`
- `time_zone` integer REQ (UTC offset hours)
- `description` string opt
- `display_service_type` opt enum `yandex_delivery | cdek | dalli | russian_post | pecom | ozon | ycp_delivery | 5post | yandex_market` — service shown to the buyer for this point
  Responses: 200, 401, 500 (no 400 documented).

### 4.9 `POST /checkout/delivery/options` — compute delivery options

Mandatory if **you** manage delivery. Returns date, time interval (if applicable) and buyer cost for each option.
Request `GetDeliveryOptionsRequest` (both REQ):

- `items` array<{`id` string REQ, `quantity` integer REQ}> (which id kind — feed offer id or product id — is **UNVERIFIED**; presumably the product ids from basket/check)
- `delivery_target` `{ "delivery_method": "pickup_point"|"courier" REQ, "address": Address REQ }` — note: **no `self_pickup`** here. For courier: `locality`+`address`; for pickup_point: `pickup_point_id`.

200 `GetDeliveryOptionsResponse`: schema says **`{ "delivery_options": [DeliveryOption] }`** (`delivery_options` REQ).
**SPEC INCONSISTENCY:** the 200 _example_ in the same spec uses key **`options`** instead of `delivery_options`. UNVERIFIED which one Yandex's client reads. Safest: emit both keys (`options` and `delivery_options`) with identical arrays, or confirm with Yandex support before go-live.
`DeliveryOption`: `{ "delivery_date_interval": DeliveryDateInterval REQ, "cost": number(float) REQ, "id": string opt }`. `id` is echoed back as `ycp_delivery_option_id` in `/checkout` if the buyer chooses it.
Example: `{"options":[{"delivery_date_interval":{"start_interval":{"date":"2025-04-15","time":"10:00:00"},"end_interval":{"date":"2025-04-15","time":"14:00:00"}},"cost":300,"id":"option-12345"}]}`
Responses: 200, 400, 401, 500.

### 4.10 `GET /order` — order delivery information

Mandatory "если у вас подключена доставка по YCP". Returns delivery status history, item info and tracking URL.
Query: `order_id` string REQ.
200 `Order`:

- `items` array<{`id` string REQ, `quantity` integer REQ, `refused_count` integer REQ (<= quantity; number of cancelled items)}> REQ
- `delivery_statuses` array<{`status` REQ enum, `timestamp` integer(uint32) REQ — UNIX seconds}> REQ — history; status `new` is mandatory in the history
- `tracking_url` string opt
  Example: `{"items":[{"id":"50","quantity":2,"refused_count":0}],"delivery_statuses":[{"status":"in_progress","timestamp":1767243600}],"tracking_url":"https://tracking.com/1234567890"}`
  Responses: 200, 400, 401, 500 (no 404 documented, although unknown order is possible — use 404 with `Error`, UNVERIFIED).

---

## 5. Order / delivery statuses (enums)

There is **no merchant-side "order status" enum or "set order status" endpoint** in the spec. Order lifecycle events are the calls themselves (`/checkout` -> `/checkout/placed` -> `/order/cancel` | `/order/delivered`). The only status enum is `DeliveryStatus.status` (for `GET /order`):

`new`, `processing` (order is being assembled), `in_progress`, `arrived_to_pickup_point`, `delivered` (delivery completed), `cancelled`.

Cabinet note (buy-button.md): after the delivery service accepts the order, its status in the cabinet becomes **"Ожидает доставку"** (cabinet UI status, not an API enum).

## 6. Payment

- Only these API-visible payment fields exist (in `/checkout/placed`): `payment_method` (`online` | `on_delivery`), `online_payment_method` (`card` | `sbp` | `split` | `split_sbp`), `acquiring_id` (transaction id when online). **No payment status enum / payment-status webhooks / refund endpoints** in the spec (refund flow — **UNVERIFIED**).
- Cabinet "Способы оплаты" (buy-button.md):
  - Только постоплата — acquiring and cash register not required
  - Только онлайн-оплата — acquiring **required** (Яндекс Pay), online cash register optional (CloudKassir or АТОЛ); "Вы можете не подключать онлайн-кассу на стороне YCP, если отправляйте чеки из своей системы. Для настройки обратитесь в службу поддержки."
  - Онлайн-оплата и постоплата — both required
- Payment is taken by Yandex (Яндекс Пэй / Сплит), so `/checkout/placed` with `online` means already paid; the shop must not charge again (do not route to Т-Касса for these orders).

## 7. VAT

- Per item in basket check: `vat` integer percent, **default 22 %** if omitted. Allowed set (0/10/20/22, "без НДС" etc.) is **UNVERIFIED**; no enum in spec. How "без НДС" (УСН) is expressed — **UNVERIFIED**.
- In the **feed**, do NOT send `vat` (features.md lists `vat` among elements not recommended for Yandex Goods feeds; a feed with such elements "может не пройти проверку").
- Item prices are "including all taxes" (feed `price`); in `/checkout` items carry `regular_price`/`final_price` only; delivery `price` has no VAT field.
- Receipts (54-ФЗ): created by Yandex's cash register (CloudKassir / АТОЛ) or by the shop's own system (see section 6). Test step in the cabinet checks "Чек формируется".

## 8. Health check rule

`is_health_check` on `/checkout/basket/check` (REQUIRED field in request): background availability checks, **at most once per 10 seconds**. If `true`, **do not change the response — neither HTTP code nor body** (i.e. do not special-case it, do not return a stub/empty response, do not skip stock/price logic; answer like a real buyer request). Cabinet runs a technical check **every 8 hours** and pauses the button on failures (reason codes in section 2). The test product ids Yandex uses for checks: "примеры, которые указаны в личном кабинете YCP или Яндекс Товаров" (buy-button.md).

## 9. Product-ID semantics

- The feed's `offer id` (attribute `id` on `<offer>`, "Идентификатор товара в вашей системе", up to 80 chars, unique, **cannot be changed after adding**) must match the product id on the site (buy-button.md Step 4: "поле `offer_id` в фиде совпадает с ID товара на сайте").
- `/checkout/basket/check`: first call when the buyer first goes to checkout passes the **feed offerID** (`offers_id_from_merchant_center: true`); repeated calls pass the **product `id` returned by the shop in the previous basket/check response** (`false`). Therefore the response `items[].id` is the canonical product id for the session and everything afterwards: `/checkout` `items[].id`, `/checkout/delivery/options` `items[].id` (assumed), `/order/delivered` `purchased_items[].id`, `GET /order` `items[].id`.
- Simplest compliant design: keep `product id == feed offer id` (then both modes are identical). If you map them, you must translate in basket/check based on `offers_id_from_merchant_center`.
- Variations: separate products each with own `id`, price, stock, dimensions; linked through `variations[]` plus shared characteristic `code`s; the relation must be symmetric (see 4.2). Each variation has its own entry in the feed (own `offer id`) — the doc does not say whether variation ids must be in the feed (**UNVERIFIED**, but "Кнопка может отображаться только для товаров, которые переданы через фиды").
- Feed offer identity in Yandex = pair (`feed id` + `offer id`); moving an `offer id` to another feed makes it a new offer (form-feed.md, "Требования к фиду").

## 10. Delivery model

Two modes (cabinet: "Склады и логистика" settings + `service_type`):

1. **Yandex / delivery-service-managed** (`service_type` in `yandex_delivery`, `cdek`, `pecom`, `russian_post`, `dalli`, `ycp`; cabinet integrations: СДЭК, Яндекс.Доставка, ПЭК, Почта России): the shop returns **only warehouse stock** in basket/check (warehouse ids from `/warehouses`); Yandex computes options via the services' own APIs and picks pickup points itself. Shop must implement `/order/delivered` (mandatory) and `GET /order` (when "доставка по YCP" connected). Warehouse needs shipping schedule, address, delivery service (for Яндекс Доставка pick the warehouse id from the Yandex Delivery list; courier pick-up -> "Продавец").
2. **Merchant-managed** (`service_type` `merchant_ship`; plus `self_pickup`): the shop implements `/checkout/delivery/options` (+ `/checkout/delivery/pickup_points` if pickup points) and returns cost/dates; the chosen option id comes back as `delivery.ycp_delivery_option_id`.

Cabinet also supports "собственная доставка" and "самовывоз" delivery integrations (buy-button.md Step 3). Mapping of cabinet options to `service_type` values is **UNVERIFIED** (e.g. whether own delivery = `merchant_ship`).

Where delivery config lives: YCP cabinet -> "Склады и логистика"; details referenced to Yandex KIT help (https://yandex.ru/support/kit/ru/store-control/settings/warehouses).

## 11. Feed (YML for Yandex Goods) and microdata

Yandex Goods requires products from **feeds** for the button ("Кнопка может отображаться только для товаров, которые переданы через фиды"), though the Market integration route also accepts microdata (not relevant to the YCP route).

### 11.1 Feed basics (form-feed.md, offers.md, feed-load.md)

- YML (XML), root `<yml_catalog date="...">` -> `<shop>` (`name`, `company`, `url`, `platform`, `categories/category[@id,@parentId]`, optional `delivery-options`/`pickup-options`) -> `<offers><offer id="...">`.
- Encoding UTF-8 or windows-1251; escape `" & > < '` as `&quot; &amp; &gt; &lt; &apos;`; no control chars 0–31 except 9, 10, 13. Max feed size 2 GB; max 1000 feeds per site.
- Server must send `Content-type` containing one of: `application/xml`, `application/octet-stream`, `text/xml`, `application/gzip`, `application/x-gzip`. Feed URL is entered at merchants.yandex.ru -> Товары -> Источники данных -> Фиды -> Добавить -> "Указать ссылку на файл"; choose "Регионы продажи"; optional password protection.
- Moderation: re-check within 5 business days; up to 6 resubmissions; if >25 % of a random sample has errors the whole source can be switched off; feed/site mismatch (price, availability) leads to blocking. Price updates in Search ~every 4 hours (offers.md), faster via Yandex Goods API (https://yandex.ru/dev/products/doc/ru/).
- Feed for Yandex Goods should be separate from the Yandex Market feed; avoid: `age`, `available="unknown"`, `bid`, `count`, `country_of_origin`, `downloadable`, `enable_auto_discounts`, `expiry`, `manufacturer_warranty`, `min-quantity`, `gifts`, `purchase_price`, `supplier`, `vat` (features.md).

### 11.2 Simplified offer — elements (offers.md)

Required (Да): `offer/@id`, `name` (type + brand + model + features; optimal 50–60 chars, max 150), `url` (max 512 chars, RFC 3986), `price` (one unit incl. all taxes), `currencyId` (`RUR`), `categoryId` (id from `<categories>`), `picture` (JPEG/PNG/WEBP, <=10 MB, >=300x400 px, ratio 3:4 recommended; first is main), `description` (optimal 400–600 chars, max 3000; HTML H1–H6, p, br only inside CDATA; no promo words like "скидка", "акция", "хит", no contact info/links).
Optional: `vendor`, `vendorCode`, `oldprice` (integer, discount 5–75 %, > price), `available` (use only `true` for Search), `delivery`, `delivery-options` (<=5 `option`), `pickup`, `pickup-options`, `sales_notes`, `adult`, `barcode` (EAN-13/8, UPC-A/E; GTIN mandatory for certain categories), `param name= unit=`, `weight` (kg, up to 3 decimals), `dimensions` (`L/W/H` in cm), `period-of-validity-days` / `service-life-days` / `warranty-days` (ISO 8601 `P…`), `comment-validity-days`, `comment-life-days`, `comment-warranty` (<=250 chars), `certificate`, `tn-ved-code` (10 or 14 digits), `condition@type` (`preowned|showcasesample|reduction`) with `quality` (`perfect|excellent|good`) and `reason`.
The arbitrary type (vendor.model) separates `typePrefix`/`vendor`/`model` — **not read in detail (UNVERIFIED)**; see https://yandex.ru/support/merchants/ru/export/vendor-model.md.

### 11.3 Buy-button feed switch

- `<param name="is_checkout_enabled">true|false</param>` inside `<offer>` controls the **"Купить в 1 клик"** button per product. Default (param absent) = `true` for all feed products once the button is connected. Supported in simplified and arbitrary offer types.
- If you use several feeds: set `true` in the main feed for the wanted items and `false` in other feeds.

### 11.4 Microdata (microdata.md) — recommended for site-crawled offers

- Schema.org `Product` with `offers` = `Offer` or `AggregateOffer` (JSON-LD or microdata).
- Required fields: Product `name` (Text), `brand` (Text), `image` (URL, **not** ImageObject); Offer `availability` (URL, e.g. `http://schema.org/InStock`), `price` (or `lowPrice`), `priceCurrency` (e.g. `RUB`). Optional: `description`. JSON-LD example in the doc also shows `sku`.
- Microdata is optional for the YCP/feed route; Yandex robots re-crawl weekly and refresh price/availability at least daily; site pages must be open to all IPs including Yandex robots (product-add.md). Validation tool: cabinet -> Товары -> Проверка микроразметки.

### 11.5 Shop requirements (requirement.md) — relevant to approval

- Needs the shop badge (значок магазина); functioning cart for unauthenticated users; prices visible without registration; retail; RF buyers; quality-control order tests (phone/site; confirm within 24 h in business hours).
- Legal info on the site: legal entity (name, legal address, OGRN) / IP (FIO, OGRNIP) / self-employed (FIO, INN).
- Prices/conditions must not change after order placement.
- **Prohibited goods include "Радиоактивные, едкие и взрывчатые вещества (кроме пиротехнических изделий)"**, "товары, извлеченные из оригинальной упаковки производителя", etc. For a chemistry-experiment-kit shop (Химичка), whether any reagents/kits fall under "едкие/взрывчатые" is **UNVERIFIED** — check each SKU or ask support before enabling the button on it (can use `is_checkout_enabled=false` per SKU).

## 12. Registering the shop and token (YCP cabinet)

From buy-button.md ("Как подключить в Яндекс Товарах" -> "Через интеграцию по стандарту YCP"):

Pre-conditions: shop badge present; one connection method only (KIT, Bitrix, Market or YCP API); products come from feeds in Яндекс Товары (https://merchants.yandex.ru).

1. In Yandex Goods open **Кнопка Купить** -> choose "Через интеграцию по стандарту YCP" -> **Перейти к подключению** -> registration window at https://merchants.yandex.ru/ycp (sign in with Yandex ID). Form: **Название магазина**, **Ссылка на ваш интернет-магазин**, **ИНН**, **Телефон**, **Дополнительные контакты** (Telegram), **Способ подключения** = "YCP протокол (API)" or "Модуль для 1С-Битрикс" -> **Создать кабинет для экспресс-чекаута**.
2. Implement the API methods; generate your own access token; in the YCP cabinet put it into **Токен доступа**; put the shop's API address into **URL для API**; (API-token from the cabinet "Ваш API-токен" is for shop -> YCP calls, per docs). Press **Проверить подключение** (connection check).
3. **Настройка магазина**: company info (legal name, INN), logo (JPEG/PNG/SVG), contacts, **Домен**, links to Оплата / Доставка / Правила возвратов / Условия использования pages (shown to buyers); **Способы оплаты** (acquiring Яндекс Pay, cash register CloudKassir/АТОЛ); delivery integrations; **Склады** -> button **Обновить склады через YCP** (calls `GET /warehouses`), then per-warehouse schedule, address, delivery service.
4. **Тестирование фида** -> **Выгрузить фид из Яндекс Товаров** (loads 1 accepted feed); `offer_id` must equal the site product id.
5. **Яндекс.Метрика** counter: section Метрика -> Подключить -> counter number.
6. **Тестовый заказ** in section Товары (check: receipt created, stock reserved, order handed to payment, data correct in your system; test products with variations too).
7. **Опубликовать** -> publication up to **36 hours**.

Timings: after connecting the button appears within a day; disabling takes up to 8 h and re-enabling is possible 8 h after the disable request; method change effective within a day; connection status values: Подключена / Завершите настройку / Отключаем / Приостановлена.
Cabinet fields (**UI labels**) may change — the button is in testing ("Кнопка Купить тестируется").

---

## 13. Spec inconsistencies and open questions (summary)

1. `/checkout/delivery/options` response: schema `delivery_options` vs example `options` (section 4.9). Emit both or ask support.
2. `delivery_date_interval.time_zone` is REQUIRED in the schema but missing from all examples.
3. `/checkout/basket/check` example request omits required `offers_id_from_merchant_center`, `locality`, `is_health_check`.
4. `/checkout/placed`: query params are `deprecated` yet marked required; body is the contract. `order_number` is integer there but string in `/checkout` 201.
5. Address fields are all optional in schema but conditionally required by description.
6. `DeliveryTarget.delivery_method` lacks `self_pickup` while `DeliveryInfo.delivery_method` has it.
7. No documentation of: retries/backoff, idempotency keys, request signing, rate limits, refund/payment-status flows, allowed `vat` values, price units (assume integer rubles), HTTP method for unknown product in basket/check, order status push to Yandex (only `GET /order` pull), maximum `limit` page size, how Yandex picks `warehouse_id` when several warehouses are in stock.
8. Token format (`bearerFormat: JWT`) vs "generate with any tool".
9. Base URL form for "URL для API" (root vs with `/api/v1`).
10. Exact mapping of the shop-side `id` for `/checkout/delivery/options` items (feed vs product id).
