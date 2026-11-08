// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { visibleTexts } from './sourceTexts'

const texts = (src: string, file = 'x.tsx') => visibleTexts(src, file).map((t) => t.text)

describe('visibleTexts', () => {
  it('берёт JSX-текст рядом с выражениями в фигурных скобках', () => {
    const src = `export const A = ({ n }) => <p>{n} наборов для детей{' '}<a href="/x">ещё</a></p>`
    expect(texts(src).join('|')).toContain(' наборов для детей')
  })

  it('берёт строки атрибутов и шаблонных строк', () => {
    const src =
      'export const A = ({ x }) => <img alt="для детей" title={`наборы для детей ${x}`} />'
    expect(texts(src)).toContain('для детей')
    expect(texts(src).join('|')).toContain('наборы для детей')
  })

  it('склеивает строки, соединённые через «+», и части шаблонной строки', () => {
    const src = [
      `const a = 'Работайте вместе со ' + 'взрослыми.'`,
      'const b = `под присмотром ${who} взрослых`',
    ].join('\n')
    const all = texts(src, 'x.ts')
    expect(all).toContain('Работайте вместе со взрослыми.')
    expect(all.some((t) => /под присмотром\s+взрослых/.test(t))).toBe(true)
  })

  it('не берёт комментарии', () => {
    const src = `// для детей\n/* для детей */\nexport const A = () => <p>{/* для детей */}опыты</p>`
    expect(texts(src).join('|')).not.toContain('детей')
  })

  it('«/*» внутри строки не прячет код после неё', () => {
    const src = `const accept = 'image/*'\nexport const A = () => <p>для детей</p> // */`
    expect(texts(src)).toContain('для детей')
  })

  it('указывает строку файла', () => {
    const src = `const a = 1\n\nconst b = 'для детей'`
    expect(visibleTexts(src, 'x.ts')).toEqual([{ text: 'для детей', line: 3, field: 'body' }])
  })

  it('title, description и H1 помечает как meta', () => {
    const src = [
      `export const DEFAULT_HOME_TITLE = 'Набор юного химика'`,
      `export const metadata = { description: 'Описание' }`,
      `export const product = { name: 'Название товара' }`,
      `export const A = () => <h1>Заголовок</h1>`,
      `export const B = () => <p>Текст</p>`,
    ].join('\n')
    const byText = Object.fromEntries(visibleTexts(src).map((t) => [t.text, t.field]))
    expect(byText).toEqual({
      'Набор юного химика': 'meta',
      Описание: 'meta',
      'Название товара': 'meta',
      Заголовок: 'meta',
      Текст: 'body',
    })
  })
})
