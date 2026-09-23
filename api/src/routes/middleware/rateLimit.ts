import type { RequestHandler } from 'express'

// Простой ограничитель частоты по IP (фиксированное окно, память процесса).
// Нам хватает: api — один контейнер, а защищаем мы публичные эндпоинты,
// которые ходят в СДЭК от имени нашего договора. IP берётся из req.ip — за
// Caddy это настоящий адрес клиента (см. trust proxy в app.ts).
export function rateLimit({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number
  windowMs: number
  now?: () => number
}): RequestHandler {
  const hits = new Map<string, { windowStart: number; count: number }>()

  return (req, res, next) => {
    const key = req.ip ?? 'unknown'
    const t = now()
    let entry = hits.get(key)
    if (!entry || t - entry.windowStart >= windowMs) {
      entry = { windowStart: t, count: 0 }
      hits.set(key, entry)
      // Не даём карте расти бесконечно: чистим протухшие окна изредка.
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (t - v.windowStart >= windowMs) hits.delete(k)
      }
    }
    entry.count += 1
    if (entry.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((entry.windowStart + windowMs - t) / 1000)))
      res.status(429).json({ error: { code: 'rate_limited', message: 'Слишком много запросов' } })
      return
    }
    next()
  }
}
