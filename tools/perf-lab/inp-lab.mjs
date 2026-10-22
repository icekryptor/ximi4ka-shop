// Лабораторный INP: мобильная эмуляция, замедленный CPU, тапы по элементам
// страницы; по каждому взаимодействию — длительность и её части (d — задержка
// ввода, p — обработчики, r — до отрисовки), плюс сводка Long Animation Frames
// по скриптам. Никаких записей на сервер: все не-GET запросы и сторонние
// не-скрипты обрываются (маяки Метрики/VK, sendBeacon событий витрины).
//
// usage: node tools/perf-lab/inp-lab.mjs <url> <cpuRate> <thirdParty:on|off> <mode:settled|early> [runs]
// env:   STEPS=home|product|catalog|nav (набор тапов), GAP (мс между тапами в settled), CHROME.
// mode=early — тапы сразу после DOMContentLoaded (гидратация и старт счётчиков),
// settled — через 6 с после load. Без GPU растёт presentation delay, поэтому
// Chrome запускается с GPU-флагами.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(repoRoot, 'package.json'))('playwright-core')

const [url = 'https://ximi4ka.ru/', cpu = '4', tp = 'on', mode = 'settled', runsArg = '3'] =
  process.argv.slice(2)
const runs = Number(runsArg)
const OWN = new URL(url).host

const observer = () => {
  window.__ev = []
  window.__loaf = []
  new PerformanceObserver((l) => {
    for (const e of l.getEntries())
      if (e.interactionId)
        window.__ev.push({
          id: e.interactionId,
          name: e.name,
          start: e.startTime,
          dur: e.duration,
          delay: e.processingStart - e.startTime,
          proc: e.processingEnd - e.processingStart,
          pres: e.startTime + e.duration - e.processingEnd,
          target: e.target
            ? (
                e.target.getAttribute('aria-label') ||
                e.target.textContent ||
                e.target.tagName
              ).slice(0, 40)
            : '',
        })
  }).observe({ type: 'event', durationThreshold: 16, buffered: true })
  new PerformanceObserver((l) => {
    for (const e of l.getEntries())
      window.__loaf.push({
        start: e.startTime,
        dur: e.duration,
        block: e.blockingDuration,
        scripts: e.scripts.map((s) => ({
          src: (s.sourceURL || '').replace(/^https?:\/\//, '').slice(0, 70),
          fn: s.sourceFunctionName,
          inv: (s.invoker || '').slice(0, 60),
          dur: Math.round(s.duration),
          type: s.invokerType,
        })),
      })
  }).observe({ type: 'long-animation-frame', buffered: true })
}

const T = { timeout: 5000 }
const STEPS = {
  home: [
    ['Открыть меню', async (p) => p.getByRole('button', { name: 'Открыть меню' }).tap(T)],
    ['Закрыть меню (Escape)', async (p) => p.keyboard.press('Escape')],
    ['Следующий слайд', async (p) => p.getByRole('button', { name: 'Следующий слайд' }).tap(T)],
    ['Предыдущий слайд', async (p) => p.getByRole('button', { name: 'Предыдущий слайд' }).tap(T)],
    [
      'Таб Реактивы',
      async (p) => p.getByRole('tab', { name: 'Реактивы', exact: true }).first().tap(T),
    ],
    ['Открыть поиск', async (p) => p.getByRole('button', { name: 'Открыть поиск' }).tap(T)],
    ['Ввод «на»', async (p) => p.keyboard.type('на', { delay: 120 })],
  ],
  product: [
    ['Show image 2', async (p) => p.getByRole('button', { name: 'Show image 2' }).tap(T)],
    ['+ количество', async (p) => p.getByRole('button', { name: 'increase quantity' }).tap(T)],
    ['Таб Состав', async (p) => p.getByRole('tab', { name: 'Состав' }).tap(T)],
    [
      'В корзину',
      async (p) =>
        p
          .getByRole('button', { name: /В корзину/ })
          .first()
          .tap(T),
    ],
    ['Escape', async (p) => p.keyboard.press('Escape')],
    ['Открыть меню', async (p) => p.getByRole('button', { name: 'Открыть меню' }).tap(T)],
  ],
  catalog: [
    ['Списком', async (p) => p.getByRole('button', { name: 'Списком' }).tap(T)],
    ['Плиткой', async (p) => p.getByRole('button', { name: 'Плиткой' }).tap(T)],
    [
      'В корзину #1',
      async (p) => p.getByRole('button', { name: /^В корзину: Сульфат алюминия/ }).tap(T),
    ],
    ['Escape', async (p) => p.keyboard.press('Escape')],
    ['+ #1', async (p) => p.getByRole('button', { name: 'Увеличить количество' }).first().tap(T)],
    [
      'В корзину #3',
      async (p) => p.getByRole('button', { name: /^В корзину: Хлорид бария/ }).tap(T),
    ],
    ['Escape2', async (p) => p.keyboard.press('Escape')],
    ['Открыть меню', async (p) => p.getByRole('button', { name: 'Открыть меню' }).tap(T)],
  ],
  nav: [
    ['Клик: карточка товара', async (p) => p.locator('a[href^="/product/"]').nth(2).tap(T)],
    ['Клик: Каталог в шапке', async (p) => p.locator('header a[href="/catalog"]').first().tap(T)],
    ['Клик: карточка товара 2', async (p) => p.locator('a[href^="/product/"]').nth(5).tap(T)],
  ],
}
const steps = STEPS[process.env.STEPS ?? 'home']

async function one(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    locale: 'ru-RU',
  })
  await ctx.route('**/*', (route) => {
    const r = route.request()
    const host = new URL(r.url()).host
    if (r.method() !== 'GET') return route.abort()
    if (host !== OWN) {
      if (tp === 'off') return route.abort()
      if (r.resourceType() !== 'script') return route.abort()
    }
    return route.continue()
  })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(cpu) })
  await page.addInitScript(observer)
  const t0 = Date.now()
  await page.goto(url, { waitUntil: mode === 'early' ? 'domcontentloaded' : 'load' })
  if (mode === 'settled') await page.waitForTimeout(6000)
  const res = []
  for (const [label, fn] of steps) {
    const before = await page.evaluate(() => window.__ev.length)
    const at = Date.now() - t0
    try {
      await fn(page)
    } catch (e) {
      res.push({ label, err: String(e).slice(0, 80) })
      continue
    }
    await page.waitForTimeout(mode === 'early' ? 150 : Number(process.env.GAP ?? 900))
    const ev = await page.evaluate((b) => window.__ev.slice(b), before)
    const worst = ev.sort((a, b) => b.dur - a.dur)[0]
    res.push({
      label,
      at,
      ...(worst
        ? {
            dur: worst.dur,
            delay: Math.round(worst.delay),
            proc: Math.round(worst.proc),
            pres: Math.round(worst.pres),
            ev: worst.name,
          }
        : { dur: '<16' }),
    })
  }
  await page.waitForTimeout(1500)
  const loaf = await page.evaluate(() => window.__loaf)
  await ctx.close()
  return { res, loaf }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  headless: true,
  args: [
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
  ],
})
const all = []
for (let i = 0; i < runs; i++) all.push(await one(browser))
await browser.close()

console.log(`\n== ${url} cpu=${cpu}x thirdParty=${tp} mode=${mode} runs=${runs}`)
const labels = steps.map((s) => s[0])
for (const l of labels) {
  const rows = all.map((a) => a.res.find((r) => r.label === l))
  console.log(
    l.padEnd(24),
    rows
      .map((r) =>
        r.err ? 'ERR' : `${r.dur}(d${r.delay ?? '-'}/p${r.proc ?? '-'}/r${r.pres ?? '-'})@${r.at}`,
      )
      .join('  '),
  )
}
const errs = all.flatMap((a) => a.res.filter((r) => r.err))
if (errs.length) console.log('errors:', errs.slice(0, 3))
// Сводка LoAF: суммарное время скриптов по источнику за все прогоны
const agg = {}
for (const a of all)
  for (const f of a.loaf)
    for (const s of f.scripts) {
      const key = (s.src.split('?')[0] || '(inline/' + s.type + ')') + ' :: ' + s.inv.slice(0, 40)
      agg[key] = (agg[key] || 0) + s.dur
    }
console.log('\nLoAF script time per run (ms), top 18:')
for (const [k, v] of Object.entries(agg)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 18))
  console.log(String(Math.round(v / runs)).padStart(6), k)
const tot = all.map((a) => Math.round(a.loaf.reduce((s, f) => s + f.block, 0)))
console.log('LoAF blocking total per run:', tot.join(', '))
