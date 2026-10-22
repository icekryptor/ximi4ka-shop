import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

// next/script в jsdom не исполняет код — подменяем на <script> с тем же телом.
vi.mock('next/script', () => ({
  default: ({ id, children, strategy }: { id?: string; children?: string; strategy?: string }) => (
    <script data-testid={id} data-strategy={strategy}>
      {children}
    </script>
  ),
}))

import * as analytics from './analytics'
import { MetrikaScript, VarioqubScript, VkPixelScript } from './analytics'
import { reachGoal, setMetrikaCounterId } from './metrika'

afterEach(() => {
  setMetrikaCounterId(null)
  delete (window as Window & { ym?: unknown }).ym
})

describe('MetrikaScript', () => {
  it('грузится после load, чтобы не мешать главной картинке', () => {
    const { getByTestId } = render(<MetrikaScript counterId="12345" />)
    expect(getByTestId('metrika')).toHaveAttribute('data-strategy', 'lazyOnload')
  })

  it('инициализирует счётчик с ecommerce в dataLayer и без вебвизора', () => {
    const { getByTestId } = render(<MetrikaScript counterId="12345" />)
    const code = getByTestId('metrika').textContent ?? ''
    expect(code).toContain('ym("12345", "init", {')
    expect(code).toContain('ecommerce:"dataLayer"')
    expect(code).toContain('clickmap:true')
    expect(code).not.toContain('webvisor')
  })

  it('отдаёт ID счётчика хелперам: reachGoal начинает работать', () => {
    const ym = vi.fn()
    ;(window as Window & { ym?: unknown }).ym = ym
    reachGoal('open_cart')
    expect(ym).not.toHaveBeenCalled()
    render(<MetrikaScript counterId="12345" />)
    reachGoal('open_cart')
    expect(ym).toHaveBeenCalledWith('12345', 'reachGoal', 'open_cart')
  })
})

describe('VarioqubScript', () => {
  it('грузится после load, чтобы не мешать главной картинке', () => {
    const { getByTestId } = render(<VarioqubScript counterId="12345" />)
    expect(getByTestId('varioqub')).toHaveAttribute('data-strategy', 'lazyOnload')
  })

  it('грузит exp.js с abt.s3.yandex.net и стартует эксперименты на счётчике сайта', () => {
    const { getByTestId } = render(<VarioqubScript counterId="12345" />)
    const code = getByTestId('varioqub').textContent ?? ''
    expect(code).toContain('"https://abt.s3.yandex.net/expjs/latest/exp.js"')
    expect(code).toContain('"ymab"')
    expect(code).toContain('ymab("metrika.12345", "init")')
  })

  it('при сбое загрузки exp.js отдаёт колбэкам пустые флаги, а не вешает страницу', () => {
    const { getByTestId } = render(<VarioqubScript counterId="12345" />)
    const code = getByTestId('varioqub').textContent ?? ''
    expect(code).toContain("addEventListener('error'")
    expect(code).toContain('flags:{}')
  })

  it('экранирует ID через JSON.stringify', () => {
    const { getByTestId } = render(<VarioqubScript counterId={'1"+alert(1)+"'} />)
    const code = getByTestId('varioqub').textContent ?? ''
    expect(code).toContain(JSON.stringify('metrika.1"+alert(1)+"'))
  })
})

describe('VkPixelScript', () => {
  it('грузится после load, чтобы не мешать главной картинке', () => {
    const { getByTestId } = render(<VkPixelScript />)
    expect(getByTestId('vk-pixel')).toHaveAttribute('data-strategy', 'lazyOnload')
  })

  it('ставит пиксель VK 3799738 и грузит code.js с top-fwz1.mail.ru', () => {
    const { getByTestId } = render(<VkPixelScript />)
    const code = getByTestId('vk-pixel').textContent ?? ''
    expect(code).toContain('_tmr.push({id: "3799738", type: "pageView"')
    expect(code).toContain('https://top-fwz1.mail.ru/js/code.js')
  })

  it('экранирует ID через JSON.stringify', () => {
    const { getByTestId } = render(<VkPixelScript pixelId={'1"});alert(1);//'} />)
    expect(getByTestId('vk-pixel').textContent).toContain('id: "1\\"});alert(1);//"')
  })
})

// GTM снят 23.10.2026 (пустой контейнер, ~100 мс главного потока после load).
describe('GTM', () => {
  it('модуль больше не экспортирует GTM', () => {
    expect(Object.keys(analytics).filter((name) => /^gtm/i.test(name))).toEqual([])
  })
})
