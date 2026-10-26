// FCP/LCP на «медленном 4G» с настоящим мультиплексированием HTTP/2 сервера.
// Между Chrome и сервером стоит TCP-прокси с задержкой и общей полосой; TLS
// сквозной, Chrome ходит на ximi4ka.ru через --host-resolver-rules. Lighthouse
// и троттлинг DevTools этого не моделируют: они режут полосу в браузере, а
// очередь потоков на сервере (round-robin у Caddy/Go) остаётся за кадром.
//
// usage: node tools/perf-lab/fcp-lab.mjs <path> <label> [runs]
// env:   UPSTREAM=127.0.0.1:8443 — локальный стенд (bench.sh); без него — прод.
//        RTT (мс, 250), DOWN_KBPS (1600), UP_KBPS (750), CPU (4), SETTLE (мс, 300),
//        VARIANT=nojs|nofontimg|nojs+nofontimg|nothird — обрывать часть запросов.
// Все не-GET запросы и сторонние не-скрипты обрываются: стенд не пишет в
// Метрику, VK и analytics_events.
import net from 'node:net'
import dns from 'node:dns/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = createRequire(path.join(repoRoot, 'package.json'))('playwright-core')

const [pagePath = '/', label = 'run', runsArg = '5'] = process.argv.slice(2)
const HOST = 'ximi4ka.ru'
const RTT = Number(process.env.RTT ?? 250)
const DOWN = (Number(process.env.DOWN_KBPS ?? 1600) * 1000) / 8 // байт/с
const UP = (Number(process.env.UP_KBPS ?? 750) * 1000) / 8
const VARIANT = process.env.VARIANT ?? ''

const [upstreamHost, upstreamPort] = process.env.UPSTREAM
  ? process.env.UPSTREAM.split(':')
  : [(await dns.lookup(HOST, { family: 4 })).address, '443']

// Общая полоса на направление (один «канал» пользователя) + половина RTT в пути.
function shaper(bytesPerSec) {
  let busyUntil = 0
  return (len) => {
    const now = Date.now()
    const start = Math.max(now, busyUntil)
    busyUntil = start + (len / bytesPerSec) * 1000
    return busyUntil - now + RTT / 2
  }
}

function startProxy() {
  const down = shaper(DOWN)
  const up = shaper(UP)
  const server = net.createServer((client) => {
    const upstream = net.connect(Number(upstreamPort), upstreamHost)
    const pipe = (src, dst, delayFor) =>
      src.on('data', (chunk) => {
        setTimeout(() => dst.writable && dst.write(chunk), delayFor(chunk.length))
      })
    pipe(client, upstream, up)
    pipe(upstream, client, down)
    const end = () =>
      setTimeout(() => {
        client.destroy()
        upstream.destroy()
      }, RTT)
    client.on('close', end).on('error', end)
    upstream.on('close', end).on('error', end)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

const proxy = await startProxy()
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  headless: true,
  args: [
    `--host-resolver-rules=MAP ${HOST}:443 127.0.0.1:${proxy.address().port}`,
    '--disable-quic',
    ...(process.env.UPSTREAM ? ['--ignore-certificate-errors'] : []),
    // Без GPU первый кадр ждёт компиляции шейдеров — это эффект серверов PSI, не поля.
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
  ],
})

// Изредка первая навигация через прокси зависает — такие прогоны повторяем,
// медиана считается по N успешным.
const res = []
for (let attempt = 0; res.length < Number(runsArg) && attempt < Number(runsArg) * 2; attempt++) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  })
  await ctx.route('**/*', (route) => {
    const r = route.request()
    const u = new URL(r.url())
    if (r.method() !== 'GET') return route.abort()
    if (u.host !== HOST)
      return VARIANT.includes('nothird') || r.resourceType() !== 'script'
        ? route.abort()
        : route.continue()
    if (VARIANT.includes('nojs') && u.pathname.endsWith('.js')) return route.abort()
    if (
      VARIANT.includes('nofontimg') &&
      (u.pathname.endsWith('.woff2') || u.pathname.startsWith('/_next/image'))
    )
      return route.abort()
    return route.continue()
  })
  try {
    const page = await ctx.newPage()
    await page.addInitScript(() => {
      window.__lcp = 0
      window.__cls = 0
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__lcp = e.startTime
      }).observe({ type: 'largest-contentful-paint', buffered: true })
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value
      }).observe({ type: 'layout-shift', buffered: true })
    })
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU ?? 4) })
    await page.goto(`https://${HOST}${pagePath}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForFunction(
      () => performance.getEntriesByName('first-contentful-paint').length > 0,
      null,
      { timeout: 30000 },
    )
    await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(Number(process.env.SETTLE ?? 300))
    res.push(
      await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0]
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime
        const css = performance
          .getEntriesByType('resource')
          .filter((e) => e.name.endsWith('.css'))
          .map((e) => Math.round(e.responseEnd))
        return {
          ttfb: Math.round(nav.responseStart),
          htmlEnd: Math.round(nav.responseEnd),
          html: nav.transferSize,
          cssEnd: css[0],
          fcp: Math.round(fcp),
          lcp: Math.round(window.__lcp),
          cls: Math.round(window.__cls * 1000) / 1000,
        }
      }),
    )
  } catch (e) {
    console.error('run failed', String(e).slice(0, 80))
  }
  await ctx.close()
}
await browser.close()
proxy.close()

// Серверное время на стенде плавает (локальный next ходит в API прода), поэтому
// главное — dFCP/dLCP: время от первого байта HTML.
const pick = { dFCP: (r) => r.fcp - r.ttfb, dLCP: (r) => r.lcp - r.ttfb }
const med = (k) => {
  const v = res
    .map(pick[k] ?? ((r) => r[k]))
    .filter((x) => typeof x === 'number' && !Number.isNaN(x))
    .sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : '-'
}
console.log(
  `${pagePath} ${label} RTT=${RTT} down=${(DOWN * 8) / 1000}kbps runs=${res.length} median: ` +
    `dFCP=${med('dFCP')} dLCP=${med('dLCP')} ttfb=${med('ttfb')} cssEnd=${med('cssEnd')} ` +
    `htmlEnd=${med('htmlEnd')} FCP=${med('fcp')} LCP=${med('lcp')} ` +
    `htmlKB=${Math.round(med('html') / 1024)} CLSmax=${Math.max(0, ...res.map((r) => r.cls))}`,
)
