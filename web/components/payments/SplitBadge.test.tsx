import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

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

import { SplitBadge, SplitBadgeAuto, SplitBadgeLazy, YANDEX_PAY_SDK_URL } from './SplitBadge'
import { resetPublicYandexPayCacheForTests } from '@/lib/yandexPay'

beforeEach(() => {
  resetPublicYandexPayCacheForTests()
  api.yandexPay = null
  api.calls = 0
})

describe('SplitBadge', () => {
  it('бейдж Сплита с суммой, Merchant ID и местом; скрипт — lazyOnload; место не резервируется', () => {
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
    // Место не резервируем: Яндекс рисует плашку не всем (нужен вход в Яндекс и лимит Сплита).
    expect(screen.getByTestId('split-badge').className).not.toMatch(/min-h-/)
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

describe('SplitBadgeLazy (карточки в каталоге и на главной)', () => {
  type Callback = (entries: Array<{ isIntersecting: boolean }>) => void
  let observed: Callback | null = null
  const disconnect = vi.fn()

  beforeEach(() => {
    observed = null
    disconnect.mockClear()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: Callback) {
          observed = cb
        }
        observe() {}
        disconnect() {
          disconnect()
        }
      },
    )
  })

  it('до появления карточки на экране — ни настроек, ни скрипта, и место не занято', async () => {
    api.yandexPay = { split: true, merchantId: 'merchant-public-id' }
    const { container } = render(<SplitBadgeLazy amountRub={3099} source="listing" />)
    await act(async () => {})
    expect(screen.getByTestId('split-badge-slot').className).not.toMatch(/min-h-/)
    expect(container.querySelector('yandex-pay-badge')).toBeNull()
    expect(screen.queryByTestId('yandex-pay-sdk')).toBeNull()
    expect(api.calls).toBe(0)
  })

  it('карточка показалась — маленький бейдж на её цену с нужным местом, наблюдатель снят', async () => {
    api.yandexPay = { split: true, merchantId: 'merchant-public-id' }
    const { container } = render(<SplitBadgeLazy amountRub={3099} source="main" />)
    await act(async () => observed?.([{ isIntersecting: true }]))
    await vi.waitFor(() => expect(container.querySelector('yandex-pay-badge')).not.toBeNull())
    const badge = container.querySelector('yandex-pay-badge')
    expect(badge).toHaveAttribute('amount', '3099.00')
    expect(badge).toHaveAttribute('source', 'main')
    expect(badge).toHaveAttribute('size', 's')
    expect(disconnect).toHaveBeenCalled()
  })

  it('Яндекс недоступен — после появления бейджа нет', async () => {
    const { container } = render(<SplitBadgeLazy amountRub={3099} source="listing" />)
    await act(async () => observed?.([{ isIntersecting: true }]))
    await vi.waitFor(() => expect(api.calls).toBe(1))
    expect(container.querySelector('yandex-pay-badge')).toBeNull()
  })
})
