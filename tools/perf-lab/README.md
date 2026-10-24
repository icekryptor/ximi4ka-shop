# perf-lab — стенд для FCP/LCP и INP витрины

Зачем: полевые FCP и INP (CrUX, телефоны) не воспроизводятся ни Lighthouse, ни троттлингом DevTools. Lighthouse
(Lantern) и DevTools режут полосу внутри браузера и не видят главного: HTTP/2 у Caddy (Go, `net/http`) раздаёт канал всем
потокам **по кругу** и игнорирует приоритеты Chrome. Поэтому на медленной сети блокирующий CSS делит полосу с JS,
шрифтами и картинками. Стенд ставит между Chrome и сервером TCP-прокси с задержкой и общей полосой, а сервер
поднимает за Go HTTP/2-прокси с тем же планировщиком.

Требования: зависимости в корне (`npm ci`), Chromium для Playwright (`npx playwright install chromium`), Go для
`h2proxy`. Сборки и логи — в `$PERF_LAB_DIR` (по умолчанию `/tmp/perf-lab`).

## FCP/LCP: сравнить сборки

```bash
tools/perf-lab/build.sh base                  # текущее дерево → /tmp/perf-lab/builds/base
# … правка …
tools/perf-lab/build.sh candidate
tools/perf-lab/bench.sh base 9                # главная, /catalog, товар; по 9 прогонов
tools/perf-lab/bench.sh candidate 9
```

Смотреть на `dFCP`/`dLCP` — время от первого байта HTML. Локальный next ходит за данными в API прода через
интернет, поэтому TTFB на стенде плавает сильнее, чем на проде. Разброс большой: решать по медиане 9+ прогонов и по
согласию всех трёх страниц. Параметры сети: `RTT` (мс), `DOWN_KBPS`, `UP_KBPS`; по умолчанию 250 мс и 1,6 Мбит/с
(RTT p75 пользователей в CrUX на 10.2026 — 250–300 мс).

Прямо по проду, без сборки: `node tools/perf-lab/fcp-lab.mjs / prod 9`. Чтобы понять, кто отбирает полосу, обрывайте
части запросов: `VARIANT=nojs`, `nofontimg`, `nojs+nofontimg`.

## Прод через локальный прокси (A/B заголовков без выкатки)

`h2proxy` проксирует и сам прод; Chrome ходит в него через `UPSTREAM`. С `DOC_ACCEPT_ENCODING=zstd` HTML у прода
просится только в zstd — так проверяли `compress: false` (сжимает Caddy, а не Next). Подменить `Accept-Encoding` из
Playwright нельзя: Chrome выставляет его сам.

```bash
tools/perf-lab/h2proxy/h2proxy 127.0.0.1:9443 https://ximi4ka.ru &
DOC_ACCEPT_ENCODING=zstd tools/perf-lab/h2proxy/h2proxy 127.0.0.1:9444 https://ximi4ka.ru &
UPSTREAM=127.0.0.1:9443 node tools/perf-lab/fcp-lab.mjs / next-gzip 9
UPSTREAM=127.0.0.1:9444 node tools/perf-lab/fcp-lab.mjs / caddy-zstd 9
```

## INP: тапы на замедленном CPU

```bash
STEPS=catalog node tools/perf-lab/inp-lab.mjs https://ximi4ka.ru/catalog 6 on early 3
STEPS=home    node tools/perf-lab/inp-lab.mjs https://ximi4ka.ru/ 4 on settled 3
```

Против локальной сборки: в одном терминале `tools/perf-lab/serve.sh <build>`, в другом — тот же запуск с
`UPSTREAM=127.0.0.1:8443`.

`early` — тапы сразу после DOMContentLoaded (гидратация, старт счётчиков), `settled` — через 6 с после load.
`thirdParty=off` обрывает сторонние скрипты: так видна их доля. Скрипт печатает длительность каждого взаимодействия
и её части (задержка ввода / обработчики / до отрисовки) и сводку Long Animation Frames по скриптам.

## Правила

- Стенд не пишет на прод: все не-GET запросы и сторонние не-скрипты обрываются (маяки Метрики и VK, события
  `/api/public/events`). Не убирайте это при правках, иначе стенд засорит Метрику и `analytics_events`.
- Chrome запускается с GPU (`--use-angle=metal`). Без GPU первый кадр и presentation delay раздуваются: это эффект
  серверов PSI, а не поля (см. «Известные грабли» в `docs/seo/WORKFLOW.md`).
- Результаты стенда — индикатор, а не обещание: поле проверять через CrUX (28-дневное окно) и полевые события
  `web_vital`.

## Замеры 22–23.10.2026 (dFCP / dLCP, мс, медиана 9 прогонов)

| страница | как было  | без preload шрифтов | `inlineCss` | `inlineCss` без preload |
| -------- | --------- | ------------------- | ----------- | ----------------------- |
| главная  | 903/954   | 574/618             | 394/1150    | 306/819                 |
| каталог  | 1173/1186 | 814/829             | 434/1312    | 298/1004                |
| товар    | 998/998   | 578/578             | 305/910     | 266/566                 |

`experimental.inlineCss` ускоряет FCP, но Next дублирует CSS в RSC-данных: HTML главной растёт с 56 до 116 КБ (gzip),
и это ухудшает LCP. Взяли только снятие preload шрифтов. CLS одинаковый (0 / 0,001 / 0,023).
