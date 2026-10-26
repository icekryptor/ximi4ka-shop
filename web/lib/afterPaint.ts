/**
 * Вызывает fn после того, как браузер отрисует следующий кадр: rAF срабатывает
 * перед отрисовкой, а таймер внутри него — уже после. Так аналитика (dataLayer,
 * цели Метрики, sendBeacon) не попадает в обработку клика, и посетитель видит
 * отклик кнопки раньше — это и меряет INP.
 *
 * Вкладка в фоне кадров не рисует, rAF там стоит до возвращения посетителя.
 * Поэтому кадр соревнуется с запасным таймером на 100 мс (что раньше, то и
 * запускает), а в уже скрытой вкладке и без rAF хватает одного таймера.
 *
 * Порядок вызовов сохраняется: готовое событие ждёт, пока уйдут все,
 * поставленные раньше, — событие после скрытия вкладки не обгонит застрявшее
 * до него (ожидание не дольше тех же 100 мс).
 *
 * Только для событий, после которых посетитель остаётся на странице: начало
 * оформления, покупку и всё, за чем может последовать уход со страницы, слать
 * сразу — отложенное событие при уходе потеряется.
 */
export const AFTER_PAINT_MAX_WAIT_MS = 100

interface Pending {
  fn: () => void
  ready: boolean
  fallback?: ReturnType<typeof setTimeout>
}

const queue: Pending[] = []

/** Только для тестов: очередь модульная, между тестами её надо сбрасывать. */
export function resetAfterPaintForTests(): void {
  queue.length = 0
}

function flush(): void {
  while (queue.length > 0 && queue[0].ready) {
    const { fn } = queue.shift()!
    try {
      fn()
    } catch (err) {
      // Сбой одного события не держит очередь; ошибка всплывает своим таймером,
      // как раньше, когда у каждого события был собственный setTimeout.
      setTimeout(() => {
        throw err
      }, 0)
    }
  }
}

export function afterNextPaint(fn: () => void): void {
  const entry: Pending = { fn, ready: false }
  queue.push(entry)

  const run = (): void => {
    if (entry.ready) return
    entry.ready = true
    clearTimeout(entry.fallback)
    flush()
  }

  if (
    typeof requestAnimationFrame !== 'function' ||
    typeof document === 'undefined' ||
    document.visibilityState === 'hidden'
  ) {
    setTimeout(run, 0)
    return
  }
  requestAnimationFrame(() => {
    setTimeout(run, 0)
  })
  entry.fallback = setTimeout(run, AFTER_PAINT_MAX_WAIT_MS)
}
