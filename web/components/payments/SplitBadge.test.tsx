import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// next/script в jsdom не исполняет код — подменяем на <script> с теми же атрибутами.
vi.mock('next/script', () => ({
  default: ({ id, src, strategy }: { id?: string; src?: string; strategy?: string }) => (
    <script data-testid={id} data-src={src} data-strategy={strategy} />
  ),
}))

const api = vi.hoisted(() => ({ yandexPay: null as unknown, calls: 0 }))
vi.mock('@/lib/api', () => ({
  getPublicSettings: async () => {
    api.calls += 1
    return { yandexPay: api.yandexPay }
  },
}))

import { SplitBadge, SplitBadgeAuto, YANDEX_PAY_SDK_URL } from './SplitBadge'
import { resetPublicYandexPayCacheForTests } from '@/lib/yandexPay'

beforeEach(() => {
  resetPublicYandexPayCacheForTests()
  api.yandexPay = null
  api.calls = 0
})

describe('SplitBadge', () => {
  it('бейдж Сплита с суммой, Merchant ID и местом; скрипт — lazyOnload; высота зарезервирована', () => {
    const { container } = render(
      <SplitBadge merchantId="merchant-public-id" amountRub={2490} source="item" />,
    )
    const badge = container.querySelector('yandex-pay-badge')
    expect(badge).toHaveAttribute('type', 'bnpl')
    expect(badge).toHaveAttribute('amount', '2490.00')
    expect(badge).toHaveAttribute('merchant-id', 'merchant-public-id')
    expect(badge).toHaveAttribute('source', 'item')
    const script = screen.getByTestId('yandex-pay-sdk')
    expect(script).toHaveAttribute('data-src', YANDEX_PAY_SDK_URL)
    expect(script).toHaveAttribute('data-strategy', 'lazyOnload')
    expect(screen.getByTestId('split-badge').className).toContain('min-h-[40px]')
  })

  it.each([null, undefined, '', '  '])(
    'без Merchant ID (%s) — ничего, скрипт не грузится',
    (merchantId) => {
      const { container } = render(
        <SplitBadge merchantId={merchantId} amountRub={2490} source="item" />,
      )
      expect(container).toBeEmptyDOMElement()
    },
  )

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])('сумма %s — бейджа нет', (amount) => {
    const { container } = render(<SplitBadge merchantId="m" amountRub={amount} source="cart" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('SplitBadgeAuto', () => {
  it('берёт Merchant ID из публичных настроек; две плашки — один запрос', async () => {
    api.yandexPay = { split: true, merchantId: 'merchant-public-id' }
    const { container } = render(
      <>
        <SplitBadgeAuto amountRub={4500} source="cart" />
        <SplitBadgeAuto amountRub={1000} source="cart" />
      </>,
    )
    expect(await screen.findAllByTestId('split-badge')).toHaveLength(2)
    expect(container.querySelector('yandex-pay-badge')).toHaveAttribute('amount', '4500.00')
    expect(api.calls).toBe(1)
  })

  it('песочница (без Merchant ID) и выключенный Яндекс — плашки нет', async () => {
    api.yandexPay = { split: true }
    const { container } = render(<SplitBadgeAuto amountRub={4500} source="cart" />)
    await vi.waitFor(() => expect(api.calls).toBe(1))
    expect(container).toBeEmptyDOMElement()
  })
})
