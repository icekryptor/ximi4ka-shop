# Доставка в Беларусь, Казахстан, Армению и Киргизию: адрес ПВЗ вручную

Дата: 17.10.2026. Ветка: `claude/eaeu-delivery-geography-8cb123`.

## Цель

Покупатель из Беларуси, Казахстана, Армении или Киргизии может оформить и оплатить заказ на сайте. Он выбирает страну, затем **город только из списка городов, где у СДЭК есть ПВЗ**, и сам пишет адрес пункта выдачи СДЭК. Если его города в списке нет, доставка туда невозможна и заказ оформить нельзя. Отправку в СДЭК оформляет оператор вручную.

Сейчас чекаут считает доставку только по России (`country_code: 'RU'` в `api/src/lib/cdek/locations.ts`), хотя страница `/order-process` уже обещает доставку в эти страны и показывает города с ПВЗ.

Не входит: автозаказ в СДЭК для этих стран, пикер ПВЗ и проверка адреса ПВЗ (город выбирается из фиксированного списка, адрес пишется вручную), расчёт по тарифу СДЭК, вопросы оплаты картами банков этих стран (Т-Касса, рубли), Узбекистан, Азербайджан, Таджикистан, прогресс-бар корзины (остаётся порогом РФ).

## Условия (от владельца, 17.10.2026)

| Страна    | Код  | Бесплатно от | Иначе  |
| --------- | ---- | ------------ | ------ |
| Беларусь  | `BY` | 3000 ₽       | 700 ₽  |
| Казахстан | `KZ` | 5000 ₽       | 900 ₽  |
| Киргизия  | `KG` | 5000 ₽       | 900 ₽  |
| Армения   | `AM` | 5000 ₽       | 1200 ₽ |

Порог считается по сумме товаров за вычетом скидки (`subtotal − discount`), как у российской доставки в `checkout.ts`.

## Список городов и цены: один источник

Модуль `shared/src/types/cis.ts` (подпуть `@ximi4ka-shop/shared/types/cis`, как у `analytics`) хранит:

- `CisCountry = 'BY' | 'KZ' | 'AM' | 'KG'`, названия стран, флаги-коды для `Flag`;
- `CIS_CITIES: Record<CisCountry, string[]>` — снимок боевого API СДЭК на 17.10.2026 (сейчас `web/lib/cdekCities.ts`, 94 города), порядок по числу точек;
- `CIS_DELIVERY_RULES: Record<CisCountry, { freeFromRub; priceRub }>` и `cisShippingRub(country, amountRub)`;
- `isCisCity(country, city)`.

Его импортируют сервер, чекаут и страница `/order-process`. Зеркал и расхождений нет. `web/lib/cdekCities.ts` удаляется.

## Подход

В `DeliveryMethod` (`'cdek_pvz' | 'cdek_courier'`) и `DeliveryDestination` значение не добавляем: от них зависят `quoteDelivery`, Яндекс Pay (`ycp/deliveryOptions.ts`), виджет СДЭК и шесть `Record<DeliveryMethod, …>`. Вместо этого вводим отдельный тип и значение:

- `delivery_method` в заказе: `cdek_manual_cis` (15 символов, колонка `varchar(64)`, миграция не нужна, CHECK-ограничений нет).
- `CisDeliveryDestination = { method: 'cdek_manual_cis'; country: CisCountry; city: string; address: string }`.
- `CheckoutDelivery = (DeliveryDestination | CisDeliveryDestination) & { comment?: string }` — только для `CheckoutRequest.delivery` и `CheckoutSchema`.
- `OrderDeliveryMethod = DeliveryMethod | 'cdek_manual_cis'` — для отображения заказов (`AccountOrderSummary`, подписи).

## Изменения

### shared

- `types/cis.ts` (см. выше), новый подпуть в `package.json` `exports`, типы реэкспортируются из `index.ts`.
- `types/order.ts`: `CheckoutRequest.delivery: CheckoutDelivery`; `DeliveryAddress` получает необязательные `country?: CisCountry`, `city?: string`; `OrderDeliveryMethod`.
- `types/account.ts`: `AccountOrderSummary.deliveryMethod: OrderDeliveryMethod`. `LastDelivery.method` остаётся `DeliveryMethod`.

### api

- `checkout.schemas.ts`: в `DeliverySchema` третий вариант `z.literal('cdek_manual_cis')` с `country` (`z.enum`), `city` (непустая), `address` (1–1000 после trim), `comment`. Для `QuoteDestinationSchema` вариант не добавляется. В `CheckoutSchema` `superRefine`: для этого способа `customer.email` обязателен (см. «Чек» ниже).
- `checkout.ts`:
  - после разбора запроса: если `!isCisCity(country, city)`, то `badRequest('delivery_city_unavailable', 'Доставка в этот город недоступна')` (400, как `delivery_point_unknown`);
  - `isKnownDeliveryPoint` и `quoteDelivery` для нового способа не вызываются, `shippingRub = cisShippingRub(country, subtotal − discount)`;
  - `deliveryAddress`: `{ address: '<город>, <введённый адрес>', comment, country, city, quote: null }`, без `cityCode` (адрес с городом, как у российских заказов, поэтому админка, кабинет и Telegram показывают его без правок).
- Автозаказ в СДЭК ничего не делает: `isCdekDelivery` для нового значения `false`, строка `cdek_shipments` не создаётся (покрыто существующим тестом «доставка не СДЭК»).
- `notifications/format.ts`: явная ветка для `cdek_manual_cis` в `deliveryCell` и `telegramCard`. Подпись: «Доставка в <страна> (СДЭК, адрес вручную): …». Без неё заказ попал бы в «Курьер».
- `account/orders.ts`: `lastDeliveryFor` берёт только заказы `cdek_pvz`/`cdek_courier` (автозаполнение чекаута); `deliveryMethod` в сводке заказа приводится к `OrderDeliveryMethod`.

### Чек и телефон (найдено при чтении кода)

- Чек Т-Кассы (`api/src/lib/payments/receipt.ts`) принимает email или российский номер `+7XXXXXXXXXX`; без них `buildReceipt` бросает ошибку после создания заказа. Телефоны Беларуси (+375), Киргизии (+996) и Армении (+374) под это не подходят. Поэтому для заказов `cdek_manual_cis` **email обязателен** (и в форме, и в схеме).
- Поле телефона в чекауте для этих стран не форматируется маской `+7` и принимает международный номер (8–15 цифр, необязательный `+`); на сервер уходит `+<цифры>`.

### web

- `useCisDelivery.ts` (состояние: страна, город, адрес, цена; сброс города при смене страны) и `CisDelivery.tsx` (поля) — отдельные файлы; `useCdekDelivery` и `CdekDelivery` не меняются.
- `lib/checkout.ts`: `validateCisCheckoutForm` (имя, международный телефон, **обязательный email**, telegram, страна, город из списка, адрес) и общий помощник проверки контактов.
- Страница чекаута: переключатель «Россия» / «Беларусь, Казахстан, Армения, Киргизия». Для второго значения показывается `CisDelivery`: выпадающий список страны, выпадающий список (`<select>`) городов этой страны (значение только из списка, поиск по первым буквам встроен в браузер), поле «Адрес пункта выдачи СДЭК», подсказка «Бесплатно от N ₽, иначе M ₽». Цена в сводке считается из общего модуля. Пока город не выбран, оформить заказ нельзя. Телефон для этого региона без маски. Код ошибки `delivery_city_unavailable` показывается у поля города.
- `OrderDetails.tsx` и `orderUi.ts`: подпись «Доставка в Беларусь, Казахстан, Армению, Киргизию (СДЭК)» (иначе в кабинете «undefined»).
- `orderProcess.ts`: константы порогов Беларуси и ЕАЭС берём из `CIS_DELIVERY_RULES`, в `condition` добавляем цену ниже порога; в шаге 1 абзац про выбор региона в чекауте. `DeliveryCities` импортирует список из shared.

### Админка и оператор

Панель СДЭК (`CdekShipmentPanel`) для таких заказов не показывается, адрес виден в карточке заказа. Оператор создаёт отправку в ЛК СДЭК по адресу из заказа и Telegram-карточки. Трека на странице заказа не будет, пока он не будет внесён отдельной фичей.

## Тесты

- shared: `cis.test.ts` (цены и пороги всех стран, `isCisCity`, нет повторов и пустых названий).
- api: `checkout.test.ts` (заказ BY/KZ/KG/AM: цена на пороге и ниже, `deliveryAddress`, нет вызова калькулятора и проверки ПВЗ, нет email — 400, город не из списка и город другой страны — 400 `delivery_city_unavailable`, невалидная страна, пустой адрес); `outbox.test.ts` (не ставит заказ в очередь СДЭК); `format.test.ts` (карточка не «Курьер»); `receipt` через email; `account-profile.test.ts` (lastDelivery не берёт такие заказы).
- web: `checkout.test.ts` (валидация международного телефона, обязательного email, города не из списка); тесты `useCisDelivery`/`CisDelivery`; тест страницы чекаута на переключение региона и payload; `OrderDetails.test.tsx`; `orderProcess.test.ts` (цены и пороги).
- Перед PR: `npm run lint`, `npm run typecheck`, тесты затронутых workspace, `npx prettier --check .`; `/security-review` (заказ и оплата).

## Риски

- Адрес ПВЗ вводится вручную и не проверяется: ошибку выявляет оператор при оформлении отправки. Город проверяется по списку.
- Список городов статичный (снимок на 17.10.2026): новый город с ПВЗ в нём появится только после ручного обновления `shared/src/types/cis.ts`.
- Тариф СДЭК за международную доставку может отличаться от фиксированной цены; цены меняются одной константой.
- Оплата рублями картами банков этих стран проверяется отдельно на стороне Т-Кассы.
- Мёрж в `main` = выкатка в прод; мёржить только по команде владельца.
