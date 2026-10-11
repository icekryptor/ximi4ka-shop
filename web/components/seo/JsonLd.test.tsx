import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { JsonLd } from './JsonLd'

// JSON-LD собирается из текстов, которые вносит редактор (вопросы FAQ,
// заголовки, описания). Строка `</script>` внутри них не должна закрывать
// тег: иначе редактор выполнит свой скрипт в браузере каждого, кто откроет
// страницу, включая админа.
describe('<JsonLd>', () => {
  const EVIL = '</script><script>window.__pwned = 1</script>'

  it('значение с </script> не закрывает тег: на странице ровно один script', () => {
    const { container } = render(<JsonLd data={{ name: EVIL }} />)

    expect(container.querySelectorAll('script')).toHaveLength(1)
    expect(container.innerHTML).not.toContain('</script><script>')
  })

  it('данные при этом читаются без потерь', () => {
    const data = { name: EVIL, list: ['a<b', '&amp;', '<!--', 'x>y'], n: 5 }

    const { container } = render(<JsonLd data={data} />)

    const text = container.querySelector('script')!.textContent!
    expect(JSON.parse(text)).toEqual(data)
  })

  it('экранирует < > & и разделители строк U+2028/U+2029', () => {
    const LS = String.fromCharCode(0x2028)
    const PS = String.fromCharCode(0x2029)

    const { container } = render(<JsonLd data={{ a: `<>&${LS}${PS}` }} />)

    const text = container.querySelector('script')!.textContent!
    expect(text).not.toMatch(/[<>&]/)
    expect(text.includes(LS)).toBe(false)
    expect(text.includes(PS)).toBe(false)
    expect(text).toContain('\\u003c')
    expect(text).toContain('\\u2028')
  })

  it('массив объектов schema.org остаётся одним блоком', () => {
    const { container } = render(<JsonLd data={[{ a: 1 }, { b: 2 }]} />)

    expect(container.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1)
    expect(JSON.parse(container.querySelector('script')!.textContent!)).toEqual([
      { a: 1 },
      { b: 2 },
    ])
  })
})
