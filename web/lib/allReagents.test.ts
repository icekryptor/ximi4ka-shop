import { describe, it, expect } from 'vitest'
import { extractContentsHtml } from '@/components/product/ContentsSection'
import { withAllReagentsContents, type ReagentForContents } from './allReagents'

const reagent = (slug: string, name: string, sortOrder: number): ReagentForContents => ({
  slug,
  name,
  sortOrder,
})

const stub = { type: 'paragraph', html: '<p>Полный состав:</p>' }

describe('withAllReagentsContents', () => {
  it('заменяет пустое «Полный состав:» списком реактивов каталога', () => {
    const blocks = withAllReagentsContents(
      [stub],
      [
        reagent('nitrat-serebra', 'Нитрат серебра 1%, 35 мл', 5),
        reagent('sulfat-alyuminiya', 'Сульфат алюминия 5%, 35 мл', 4),
      ],
    )

    expect(blocks).toHaveLength(1)
    const html = extractContentsHtml(blocks)
    expect(html).toContain('2 реактива, каждого по 2 шт.')
    // Порядок — как в каталоге (sortOrder), а не как пришло.
    expect(html).toMatch(/Сульфат алюминия 5%, 35 мл<\/li><li>Нитрат серебра 1%, 35 мл/)
  })

  it('не включает «Три кислоты» — это комбо из реактивов, а не реактив', () => {
    const html = extractContentsHtml(
      withAllReagentsContents(
        [stub],
        [reagent('tri-kisloti', 'Три кислоты', 47), reagent('magnii', 'Магний', 40)],
      ),
    )
    expect(html).not.toContain('Три кислоты')
    expect(html).toContain('1 реактив, каждого по 2 шт.')
  })

  it('экранирует название реактива', () => {
    const html = extractContentsHtml(
      withAllReagentsContents([stub], [reagent('x', 'Соль <b>& кислота</b>', 1)]),
    )
    expect(html).toContain('Соль &lt;b&gt;&amp; кислота&lt;/b&gt;')
  })

  it('оставляет прочие блоки описания на месте', () => {
    const intro = { type: 'paragraph', html: '<p>Запас для повторных опытов.</p>' }
    const blocks = withAllReagentsContents([intro, stub], [reagent('magnii', 'Магний', 40)])
    expect(blocks[0]).toBe(intro)
    expect(blocks).toHaveLength(2)
  })

  it('без реактивов (api не ответил) возвращает описание как было', () => {
    const blocks = [stub]
    expect(withAllReagentsContents(blocks, [])).toBe(blocks)
  })
})
