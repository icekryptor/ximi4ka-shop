# CMS-страницы к переносу 1:1 со старой Tilda (следующий этап)

Эти пути со старого сайта **сознательно НЕ входят** в `tilda-redirects.csv` —
они должны существовать на new.ximi4ka.ru под теми же URL как CMS-страницы
(entity `Page`, роут `web/app/[locale]/(public)/[slug]/page.tsx`).

Объём контента — видимый текст без шапки/меню/подвала, по краулу продакшна
(июль 2026). «Изобр.» — ссылки на static.tildacdn.com в контентных блоках
(картинки нужно будет перенести в наше хранилище или оставить на tildacdn,
как решили для каталога).

| Путь | Заголовок на Tilda | Текст, зн. | Изобр. | Источник |
|---|---|---:|---:|---|
| `/policy` | Политика конфиденциальности | ~17 400 | 0 | https://ximi4ka.ru/policy |
| `/oferta` | Оферта | ~3 400 | 0 | https://ximi4ka.ru/oferta |
| `/faq` | FAQ (аккордеон вопросов) | ~2 200 | 1 | https://ximi4ka.ru/faq |
| `/get_materials` | Доступ в закрытый канал | ~2 100 | 15 | https://ximi4ka.ru/get_materials |
| `/collab` | Сотрудничество с Химичкой | ~5 400 | 39 | https://ximi4ka.ru/collab |
| `/experiment` | Эксперименталити | ~5 900 | 46 | https://ximi4ka.ru/experiment |
| `/xim3_inst` | Химичка 3.0 (инструкции к набору) | ~1 500 | 6 | https://ximi4ka.ru/xim3_inst |
| `/mx_inst` | Мини-Химичка (инструкции) | ~100 | 3 | https://ximi4ka.ru/mx_inst |
| `/electroxim` | Электрохимичка (инструкции) | ~100 | 3 | https://ximi4ka.ru/electroxim |
| `/zhuk` | Хитрый жук (промо-лендинг) | ~400 | 6 | https://ximi4ka.ru/zhuk |
| `/cert` | Сертификаты соответствия | ~350 | 14 | https://ximi4ka.ru/cert |
| `/socials` | Соцсети Химички | ~90 | 0 | https://ximi4ka.ru/socials |
| `/success` | Успешный заказ! | ~300 | 0 | https://ximi4ka.ru/success |
| `/fail` | Неудачное оформление заказа | ~130 | 0 | https://ximi4ka.ru/fail |

Заметки:

- `/policy` и `/oferta` — цели редиректов `/policy2` и `/oferta2` из
  `tilda-redirects.csv`; пока страницы не созданы, эти редиректы ведут в 404.
  То же для `/collab` (← `/collab_old`) и `/success` (← `/thanksxim`,
  `/thanksxim2`).
- `/xim3_inst`, `/mx_inst`, `/electroxim` — страницы «инструкции к набору»:
  текста мало, основной контент — ссылки на PDF/видео; сверить вложения
  при переносе.
- `/success` и `/fail` — служебные страницы после оформления заказа; на новом
  сайте их вызывает платёжный флоу, поэтому URL должны совпадать 1:1.
- `/faq` — аккордеон; в CMS-блоках уже есть тип `faq` (см.
  `shared/src/types/blocks.ts`), переносить именно в него.
- Крауль-кэш страниц: scratchpad-каталог сессии переноса
  (`site/*.html`, матчить по `<link rel="canonical">`).
