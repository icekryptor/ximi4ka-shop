import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Ни один шрифт витрины не предзагружается. HTTP/2 у Caddy (Go) раздаёт канал
// всем потокам по кругу и не смотрит на приоритеты браузера, поэтому preload
// шрифта отбирает полосу у блокирующего CSS. Стенд «медленный 4G» (RTT 250 мс,
// 1,6 Мбит/с, tools/perf-lab): без preload двух файлов IBM Plex Sans FCP и LCP
// раньше на 0,33–0,42 с на главной, каталоге и товаре, CLS тот же. Вернуть
// preload можно только с замером на том же стенде.
const source = readFileSync(path.join(__dirname, 'fonts.ts'), 'utf8')

describe('app/fonts.ts', () => {
  it('не предзагружает ни одного шрифта', () => {
    const preloads = [...source.matchAll(/preload:\s*(true|false)/g)].map((m) => m[1])
    expect(preloads.length).toBeGreaterThan(0)
    expect(preloads).not.toContain('true')
  })
})
