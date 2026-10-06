import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

// next/script в jsdom не исполняет код — подменяем на <script> с тем же телом.
vi.mock('next/script', () => ({
  default: ({ id, children }: { id?: string; children?: string }) => (
    <script data-testid={id}>{children}</script>
  ),
}))

import { MetrikaScript, VkPixelScript } from './analytics'
import { reachGoal, setMetrikaCounterId } from './metrika'

afterEach(() => {
  setMetrikaCounterId(null)
  delete (window as Window & { ym?: unknown }).ym
})

describe('MetrikaScript', () => {
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

describe('VkPixelScript', () => {
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
