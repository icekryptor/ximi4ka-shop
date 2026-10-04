import { describe, it, expect } from 'vitest'
import { TOC_MIN_HEADINGS, addHeadingAnchors, shouldShowToc } from './articleToc'

const p = (html: string) => ({ type: 'paragraph', html })

describe('addHeadingAnchors', () => {
  it('ставит id на h2/h3 и собирает оглавление в порядке документа', () => {
    const { blocks, toc } = addHeadingAnchors([
      p('<p>Вступление</p><h2>Как это работает</h2><p>текст</p><h3>Реагенты</h3>'),
      p('<h2>Итоги</h2>'),
    ])
    expect(toc).toEqual([
      { id: 'kak-eto-rabotaet', text: 'Как это работает', level: 2 },
      { id: 'reagenty', text: 'Реагенты', level: 3 },
      { id: 'itogi', text: 'Итоги', level: 2 },
    ])
    expect((blocks[0] as { html: string }).html).toBe(
      '<p>Вступление</p><h2 id="kak-eto-rabotaet">Как это работает</h2><p>текст</p><h3 id="reagenty">Реагенты</h3>',
    )
    expect((blocks[1] as { html: string }).html).toBe('<h2 id="itogi">Итоги</h2>')
  })

  it('не трогает h1 и h4–h6', () => {
    const { blocks, toc } = addHeadingAnchors([p('<h1>Один</h1><h4>Четыре</h4><h6>Шесть</h6>')])
    expect(toc).toEqual([])
    expect((blocks[0] as { html: string }).html).toBe('<h1>Один</h1><h4>Четыре</h4><h6>Шесть</h6>')
  })

  it('разводит одинаковые заголовки суффиксами -2, -3', () => {
    const { toc } = addHeadingAnchors([p('<h2>Итоги</h2><h2>Итоги</h2><h3>Итоги</h3>')])
    expect(toc.map((t) => t.id)).toEqual(['itogi', 'itogi-2', 'itogi-3'])
  })

  it('не допускает коллизии с уже выданным суффиксным id', () => {
    const { toc } = addHeadingAnchors([p('<h2>Итоги</h2><h2>Итоги</h2><h2>Итоги 2</h2>')])
    const ids = toc.map((t) => t.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids.slice(0, 2)).toEqual(['itogi', 'itogi-2'])
    expect(ids[2]).toBe('itogi-2-2')
  })

  it('коллизии считаются по всей статье, а не по одному блоку', () => {
    const { toc } = addHeadingAnchors([p('<h2>Опыт</h2>'), p('<h2>Опыт</h2>')])
    expect(toc.map((t) => t.id)).toEqual(['opyt', 'opyt-2'])
  })

  it('берёт текст без вложенной разметки и раскодирует сущности', () => {
    const { toc } = addHeadingAnchors([
      p('<h2><strong>Важно</strong> знать &amp; помнить</h2><h3>Опыт&nbsp;№1</h3>'),
    ])
    expect(toc[0]).toMatchObject({ text: 'Важно знать & помнить', id: 'vazhno-znat-pomnit' })
    expect(toc[1]).toMatchObject({ text: 'Опыт №1', id: 'opyt-1' })
  })

  it('заголовок без латиницы/цифр получает запасной id и не ломает порядок', () => {
    const { toc } = addHeadingAnchors([p('<h2>日本語</h2><h2>***</h2>')])
    expect(toc.map((t) => t.id)).toEqual(['razdel', 'razdel-2'])
  })

  it('пустые заголовки пропускает: ни id, ни пункта оглавления', () => {
    const { blocks, toc } = addHeadingAnchors([p('<h2> </h2><h2><br></h2>')])
    expect(toc).toEqual([])
    expect((blocks[0] as { html: string }).html).toBe('<h2> </h2><h2><br></h2>')
  })

  it('заменяет id, который автор уже вписал в HTML, и сохраняет прочие атрибуты', () => {
    const { blocks, toc } = addHeadingAnchors([p('<h2 class="x" id="staryj">Новый</h2>')])
    expect(toc[0].id).toBe('novyy')
    expect((blocks[0] as { html: string }).html).toBe('<h2 class="x" id="novyy">Новый</h2>')
  })

  it('обрабатывает текст layout-блока и сохраняет остальные поля', () => {
    const layout = {
      type: 'layout',
      variant: 'text-left',
      text: { html: '<h2>В лаборатории</h2>' },
      image: { url: '/a.jpg', alt: 'a' },
    }
    const { blocks, toc } = addHeadingAnchors([layout])
    expect(toc).toEqual([{ id: 'v-laboratorii', text: 'В лаборатории', level: 2 }])
    expect(blocks[0]).toEqual({
      ...layout,
      text: { html: '<h2 id="v-laboratorii">В лаборатории</h2>' },
    })
  })

  it('прочие блоки и мусор проходят как есть (та же ссылка)', () => {
    const cta = { type: 'cta', heading: 'Купить', buttonLabel: 'Да', buttonHref: '/x' }
    const junk = 'не блок'
    const { blocks, toc } = addHeadingAnchors([cta, junk, null])
    expect(blocks[0]).toBe(cta)
    expect(blocks[1]).toBe(junk)
    expect(blocks[2]).toBeNull()
    expect(toc).toEqual([])
  })

  it('не мутирует входные блоки', () => {
    const input = [p('<h2>Раздел</h2>')]
    addHeadingAnchors(input)
    expect(input[0].html).toBe('<h2>Раздел</h2>')
  })

  it('идемпотентна: повторный прогон даёт те же id', () => {
    const first = addHeadingAnchors([p('<h2>Раздел</h2><h2>Раздел</h2>')])
    const second = addHeadingAnchors(first.blocks)
    expect(second.toc).toEqual(first.toc)
    expect(second.blocks).toEqual(first.blocks)
  })
})

describe('shouldShowToc', () => {
  const item = (i: number) => ({ id: `h-${i}`, text: `H ${i}`, level: 2 as const })

  it('порог — три заголовка', () => {
    expect(TOC_MIN_HEADINGS).toBe(3)
    expect(shouldShowToc([])).toBe(false)
    expect(shouldShowToc([item(1), item(2)])).toBe(false)
    expect(shouldShowToc([item(1), item(2), item(3)])).toBe(true)
    expect(shouldShowToc([item(1), item(2), item(3), item(4)])).toBe(true)
  })
})
