import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

// next/script в jsdom не исполняет код — подменяем на <script> с тем же телом.
vi.mock('next/script', () => ({
  default: ({ id, children }: { id?: string; children?: string }) => (
    <script data-testid={id}>{children}</script>
  ),
}))

import { MetrikaScript } from './analytics'
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
