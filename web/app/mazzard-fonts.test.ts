import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Mazzard H — единственный шрифт, который до первой отрисовки тянет сразу
// несколько файлов; лишние начертания съедали ≈120 КБ и тормозили Lighthouse
// mobile. Владелец оставил три: Regular 400, Medium 500, Bold 700 (без курсива).
// Тест держит набор: новое начертание добавляется только осознанно, вместе с
// правкой этого списка.
const ALLOWED_WEIGHTS = ['400', '500', '700']
const ALLOWED_FILES = ['MazzardH-Regular.woff2', 'MazzardH-Medium.woff2', 'MazzardH-Bold.woff2']

const css = readFileSync(path.join(__dirname, 'globals.css'), 'utf8')
const fontsDir = path.join(__dirname, '..', 'public', 'fonts')

const mazzardFaces = [...css.matchAll(/@font-face\s*{[^}]*}/g)]
  .map((m) => m[0])
  .filter((block) => /font-family:\s*'Mazzard H'/.test(block))
  .map((block) => ({
    file: /url\('\/fonts\/([^']+)'\)/.exec(block)?.[1],
    weight: /font-weight:\s*(\d+)/.exec(block)?.[1],
    style: /font-style:\s*(\w+)/.exec(block)?.[1],
  }))

describe('Mazzard H @font-face', () => {
  it('declares only Regular 400, Medium 500 and Bold 700, upright', () => {
    expect(mazzardFaces.map((f) => f.weight)).toEqual(ALLOWED_WEIGHTS)
    expect(mazzardFaces.every((f) => f.style === 'normal')).toBe(true)
  })

  it('points every declaration at an existing file', () => {
    expect(mazzardFaces.map((f) => f.file)).toEqual(ALLOWED_FILES)
    for (const face of mazzardFaces) {
      expect(existsSync(path.join(fontsDir, face.file ?? '')), `${face.file} missing`).toBe(true)
    }
  })

  it('keeps no unused Mazzard H files in public/fonts', () => {
    const onDisk = readdirSync(fontsDir).filter((name) => name.startsWith('MazzardH-'))
    expect(onDisk.sort()).toEqual([...ALLOWED_FILES].sort())
  })
})
