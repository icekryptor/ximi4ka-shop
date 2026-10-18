import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Знак ₽ (U+20BD) есть на главной в ценах. В подборках Google он входит в
// latin-ext, поэтому ради одного символа браузер качал Inter latin-ext (84 КБ)
// и IBM Plex Sans latin-ext (26 КБ) — на медленном 4G это ≈0,5 с до LCP. Знак
// вынесен в отдельные файлы по несколько КБ, а из диапазонов latin-ext убран.
const RUBLE = 0x20bd
const source = readFileSync(path.join(__dirname, 'fonts.ts'), 'utf8')
const fontsDir = path.join(__dirname, '..', 'public', 'fonts')

// Ширина диапазона в `unicode-range`: "U+20AD-20C0" или "U+20BD".
function covers(range: string, codePoint: number): boolean {
  return range.split(',').some((part) => {
    const m = /U\+([0-9A-F]+)(?:-([0-9A-F]+))?/i.exec(part.trim())
    if (!m) return false
    const from = parseInt(m[1], 16)
    const to = m[2] ? parseInt(m[2], 16) : from
    return codePoint >= from && codePoint <= to
  })
}

const ranges = [...source.matchAll(/value:\s*\n?\s*'(U\+[^']+)'/g)].map((m) => m[1])
const latinExtRanges = ranges.filter((r) => /U\+0100-02BA/.test(r))
const rubleRanges = ranges.filter((r) => r.trim() === 'U+20BD')

describe('знак ₽ в шрифтах', () => {
  it('не входит ни в один диапазон latin-ext', () => {
    expect(latinExtRanges.length).toBeGreaterThan(0)
    for (const range of latinExtRanges) {
      expect(covers(range, RUBLE), range).toBe(false)
    }
  })

  it('объявлен отдельными лицами для Inter, IBM Plex Sans и Unbounded', () => {
    expect(rubleRanges).toHaveLength(3)
  })

  it.each([
    'inter/inter-ruble.woff2',
    'ibm-plex-sans/ibm-plex-sans-ruble.woff2',
    'unbounded/unbounded-ruble.woff2',
  ])('%s существует и весит меньше 10 КБ', (file) => {
    const size = statSync(path.join(fontsDir, file)).size
    expect(size).toBeGreaterThan(0)
    expect(size).toBeLessThan(10 * 1024)
  })
})
