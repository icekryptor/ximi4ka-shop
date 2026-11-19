// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findKidsPositioning } from '@ximi4ka-shop/shared/content/kidsPositioning'
import { visibleTexts } from '@ximi4ka-shop/shared/content/sourceTexts'

// Сторож позиционирования 14+: в текстах витрины (строки, шаблонные строки и JSX-текст в
// web/app, web/components, web/lib) нет «для детей», возраста младше 14, «вместе со
// взрослыми» и т. п. Правила — shared/src/content/kidsPositioning.ts, решение — план
// docs/superpowers/plans/2026-10-22-reposition-14-plus.md. Админку посетитель не видит, её не
// проверяем; тексты из админки и данных проверяются отдельно, тестами сидов.

const WEB = fileURLToPath(new URL('..', import.meta.url))
const ROOTS = ['app', 'components', 'lib']
const SKIP = /\.test\.tsx?$|[\\/]__tests__[\\/]|[\\/]test-utils?[\\/]|[\\/]admin[\\/]/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return SKIP.test(path + '/') ? [] : sourceFiles(path)
    return /\.tsx?$/.test(name) && !SKIP.test(path) ? [path] : []
  })
}

describe('позиционирование 14+ в коде витрины', () => {
  it('в текстах нет детского позиционирования', () => {
    const problems: string[] = []
    let scanned = 0
    for (const file of ROOTS.flatMap((r) => sourceFiles(join(WEB, r)))) {
      for (const { text, line, field } of visibleTexts(readFileSync(file, 'utf8'), file)) {
        scanned += 1
        for (const hit of findKidsPositioning(text, field)) {
          problems.push(`${relative(WEB, file)}:${line} [${hit.rule}] ${hit.match}`)
        }
      }
    }
    // защита от холостого прогона: если обход сломается, сторож не должен молча зеленеть
    expect(scanned).toBeGreaterThan(1000)
    expect(problems).toEqual([])
  })
})
