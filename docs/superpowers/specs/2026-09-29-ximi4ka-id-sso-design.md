# ximi4ka ID — единый аккаунт магазина и XimiLearn

Дата: 29.09.2026. Продолжение спеки кабинета
(`2026-09-28-customer-account-design.md`).

## 1. Зачем

На new.ximi4ka.ru вход — по коду с почты или через Telegram-бота. На
learn.ximi4ka.ru — отдельная база учеников Supabase Auth с паролями и
логинами с карточек наборов. Один человек — два аккаунта, и способы входа на
платформе другие.

Цель: входить на платформу тем же аккаунтом и теми же способами, что в
магазине, и один раз — вошёл в магазине, на платформу попадает без ввода.

## 2. Решения (согласованы 29.09.2026)

| Вопрос              | Решение                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Кто хранит личность | Магазин (`customers`) — провайдер «ximi4ka ID». Learn — клиент, у него остаётся Supabase Auth и сессии |
| Протокол            | Упрощённый OAuth 2.0 authorization code: редирект → одноразовый код → обмен сервер-сервер с секретом   |
| Пароли в learn      | Переходный период: вход по паролю и по карточке набора остаётся ниже кнопки ximi4ka ID                 |
| Регистрация в learn | Через ximi4ka ID: `/register` уводит на вход, аккаунт появляется при первом входе                      |
| Выход               | Только на том сайте, где нажали «Выйти». Общего выхода нет                                             |
| Профиль             | Полный профиль (имя, аватар, XP, подписки) — в learn. Из магазина приходит только личность             |
| Дети с карточек     | Вход по QR и `ximi-XXXXXX` не меняется; ximi4ka ID можно привязать из профиля                          |

Отвергнуто: перевод магазина на Supabase Auth (переписать вчерашний кабинет,
Telegram в Supabase не встроен); общая cookie на `.ximi4ka.ru` с проверкой
сессии магазина из learn (связывает сайты намертво, learn ходил бы в api
магазина на каждый запрос). Экрана согласия нет — клиенты свои.

## 3. Данные

### Магазин (миграция `AddSsoAuthCodes1790720000000`)

`sso_auth_codes`: `id`, `code_hash` (sha256, уникальный), `client_id`,
`redirect_uri`, `customer_id` FK (on delete cascade), `expires_at` (60 с),
`consumed_at`, `created_at`.

`customer_aliases`: `former_id` PK, `customer_id` FK (on delete cascade),
`merged_at`. Пишет `mergeCustomers`: удалённый покупатель → оставшийся;
следы удалённого переезжают на оставшегося, цепочка слияний не рвётся.
Learn хранит id покупателя, и без следа слияние по почте завело бы человеку
второй аккаунт на платформе.

### Learn (миграция `030_ximi4ka_identities.sql`)

`ximi4ka_identities`: `user_id` PK → `auth.users` (on delete cascade),
`customer_id` уникальный, снимок `email` / `telegram_id` /
`telegram_username` (для показа в профиле), `linked_at`, `last_login_at`.
Один к одному. RLS: ученик читает свою строку, пишет только service role.

`auth_user_by_email(p_email)` — SECURITY DEFINER, EXECUTE только у
service_role: поиск в `auth.users` по почте (`admin.listUsers` постраничный и
по почте не ищет).

## 4. Поток

```
learn  /api/auth/ximi4ka/start?redirect=/dashboard[&mode=link]
         state (32 байта) + mode + redirect → HttpOnly-cookie xim_sso_state
         (SameSite=Lax, path /api/auth/ximi4ka, 10 мин)
   302 → new.ximi4ka.ru/api/account/sso/authorize?client_id=learn&redirect_uri=…&state=…
shop     клиент и redirect_uri (точное совпадение) не сошлись → 400 текстом, без редиректа
         нет сессии → 302 /account/login?next=<этот же authorize>
                      (страница входа пишет «Вход в XimiLearn», после входа
                      redirectTo(next) возвращает сюда)
         есть сессия → код в sso_auth_codes, 302 → redirect_uri?code=…&state=…
learn  /api/auth/ximi4ka/callback
         state ≠ cookie → /login?error=sso_state
         POST shop /api/account/sso/token {client_id, client_secret, code, redirect_uri}
           ← {customer: {id, email, telegramId, telegramUsername, name}, formerIds}
         mode=link  → связь с уже вошедшим учеником → /profile?ximi4ka=linked|conflict
         mode=login → ученик (§5) → лимит устройств → сессия Supabase → redirect
```

`POST /api/account/sso/token`: неверный клиент или секрет — `401
invalid_client` (код не сгорает); код чужого клиента, другого адреса
возврата, истёкший или использованный — `400 invalid_grant`. Код гасится
атомарно (`UPDATE … WHERE consumed_at IS NULL … RETURNING`).

Сессия Supabase выпускается без пароля и письма:
`admin.generateLink({type: 'magiclink'})` → `hashed_token` →
`verifyOtp({token_hash})` на серверном клиенте пишет `sb-*` cookie в ответ.
Дальше RLS, `getCachedUser`, middleware и учёт устройств работают как
раньше.

## 5. Сопоставление аккаунтов (learn)

1. Есть связь по `customer.id` или по одному из `formerIds` → этот ученик.
   Найден по прежнему id — `customer_id` в связи переписывается на текущий.
2. У покупателя есть почта (магазин её подтвердил) и в `auth.users` есть
   ученик с этой почтой → связываем. Если у ученика почта не подтверждена,
   его пароль гасится случайным: иначе тот, кто когда-то завёл аккаунт на
   чужую почту паролем, получил бы доступ, как только выпуск сессии
   подтвердит почту.
3. Иначе — новый ученик (`email_confirm: true`). Без почты (только Telegram) —
   технический адрес `c-<customer_id>@id.ximi4ka.ru`; когда в магазине
   появится настоящая почта и на платформе она свободна, она заменит
   техническую при следующем входе.

Гонка двух входов: уникальность `customer_id` отдаёт 23505 — проигравший
удаляет только что созданного ученика и перечитывает связь.

Ученик с карточки набора, привязавший ximi4ka ID: блокировка кода
(`kit_credentials.is_disabled`) действует и на этот вход, активация — как при
входе по QR.

Привязка из профиля никогда не сливает учеников: покупатель уже связан с
другим учеником — `conflict`.

## 6. Безопасность

- Открытый редирект: `redirect_uri` — точный список в окружении магазина;
  `redirect` в learn — только путь на этом сайте.
- Подмена кода (login CSRF): `state` в HttpOnly-cookie браузера, начавшего вход,
  сравнивается за постоянное время.
- Код: 32 байта, в базе только sha256, 60 секунд, одноразовый, привязан к
  клиенту и адресу возврата.
- Секрет клиента: ≥ 32 символов (короче — клиент выключен), сравнение
  sha256-хэшей через `timingSafeEqual`, живёт только на серверах.
- `Cache-Control: no-store` на обоих эндпоинтах.

## 7. Окружение и включение

Магазин (`deploy/app.env`): `SSO_LEARN_CLIENT_SECRET`,
`SSO_LEARN_REDIRECT_URIS=https://learn.ximi4ka.ru/api/auth/ximi4ka/callback`.

Learn: `XIMI4KA_SSO_CLIENT_SECRET` (то же значение), `XIMI4KA_SSO_URL`
(по умолчанию `https://new.ximi4ka.ru`), `NEXT_PUBLIC_XIMI4KA_SSO=1` —
кнопки на `/login`, `/register`, в профиле (инлайнится на билде). Всё — в
`/opt/ximilearn/deploy/app.env`: `deploy.sh` отдаёт `NEXT_PUBLIC_*` в сборку
build-arg'ами, остальное — в рантайм.

Порядок: миграции обеих сторон → секреты → деплой магазина → деплой learn с
`NEXT_PUBLIC_XIMI4KA_SSO=1`. Пока флага нет, learn выглядит как раньше.

## 8. Не входит / потом

- Общий выход и `prompt=login` («войти другим аккаунтом ximi4ka» без выхода
  в магазине).
- Отвязка ximi4ka ID в профиле learn: ученик без пароля остался бы без входа.
- Отключение паролей в learn после переходного периода.
- Покупка набора в магазине сразу открывает курс на платформе — теперь есть
  общий идентификатор (`customer_id`), нужен вебхук заказа → learn.
- Уборка протухших `sso_auth_codes` (как и остальных разовых таблиц кабинета).
- Текст бота «Войти на сайт ximi4ka.ru?» — общий для обоих сайтов.
