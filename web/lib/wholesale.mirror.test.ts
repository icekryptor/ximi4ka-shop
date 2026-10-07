import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Тело двух копий движка (всё, начиная с первого экспорта) должно совпадать
// посимвольно: цену на экране и в заказе считают разные процессы.
const MARKER = 'export interface WholesaleGroup'
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const body = (src: string) => src.slice(src.indexOf(MARKER))

describe('wholesale mirror', () => {
  it('web/lib/wholesale.ts совпадает с api/src/lib/pricing/wholesale.ts', () => {
    const web = read('./wholesale.ts')
    const api = read('../../api/src/lib/pricing/wholesale.ts')
    expect(web).toContain(MARKER)
    expect(api).toContain(MARKER)
    expect(body(web)).toBe(body(api))
  })
})
