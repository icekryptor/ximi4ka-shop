import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

// next/script: в jsdom скрипт не грузится — сразу сообщаем «готов», как onReady.
// callOnReady=false — как у next/script, когда тот же id (плашка) уже грузит pay.js:
// второй экземпляр onReady не получает.
const scriptMock = vi.hoisted(() => ({ callOnReady: true }))
vi.mock('next/script', async () => {
  const { useEffect } = await import('react')
  // Именованный компонент: правило react-hooks не пускает хук в анонимной функции.
  function MockScript({ onReady }: { onReady?: () => void }) {
    useEffect(() => {
      if (scriptMock.callOnReady) onReady?.()
    }, [onReady])
    return null
  }
  return { default: MockScript }
})

import { SPLIT_FALLBACK_TEXT, SplitWidget } from './SplitWidget'

type W = Window & { YaPay?: unknown }

function stubYaPay() {
  const session = { mountWidget: vi.fn(), unmountWidget: vi.fn(), destroy: vi.fn() }
  // Тип вызова — дженериком: иначе mock.calls типизирован пустым кортежем.
  const createSession = vi.fn<
    (data: Record<string, unknown>, handlers: unknown) => Promise<typeof session>
  >(async () => session)
  ;(window as W).YaPay = {
    createSession,
    CurrencyCode: { Rub: 'RUB' },
    WidgetType: { Ultimate: 'Ultimate' },
  }
  return { createSession, session }
}

beforeEach(() => {
  delete (window as W).YaPay
  scriptMock.callOnReady = true
})
afterEach(() => {
  delete (window as W).YaPay
})

describe('SplitWidget', () => {
  it('сессия только на Сплит, Ultimate без своей кнопки; текст уходит', async () => {
    const { createSession, session } = stubYaPay()
    render(<SplitWidget merchantId="merchant-public-id" totalRub={2390} />)
    await vi.waitFor(() => expect(session.mountWidget).toHaveBeenCalledTimes(1))
    expect(createSession).toHaveBeenCalledWith(
      {
        version: 4,
        currencyCode: 'RUB',
        merchantId: 'merchant-public-id',
        totalAmount: '2390.00',
        availablePaymentMethods: ['SPLIT'],
      },
      expect.objectContaining({ onPayButtonClick: expect.any(Function) }),
    )
    expect(session.mountWidget).toHaveBeenCalledWith(screen.getByTestId('split-widget'), {
      widgetType: 'Ultimate',
      hasCheckoutButton: false,
    })
    await vi.waitFor(() => expect(screen.queryByText(SPLIT_FALLBACK_TEXT)).toBeNull())
  })

  it('без SDK или если сессия не создалась — остаётся текст', async () => {
    const view = render(<SplitWidget merchantId="merchant-public-id" totalRub={2390} />)
    await act(async () => {})
    expect(screen.getByText(SPLIT_FALLBACK_TEXT)).toBeInTheDocument()
    view.unmount()
    const createSession = vi.fn().mockRejectedValue(new Error('split unavailable'))
    ;(window as W).YaPay = {
      createSession,
      CurrencyCode: { Rub: 'RUB' },
      WidgetType: { Ultimate: 'Ultimate' },
    }
    render(<SplitWidget merchantId="merchant-public-id" totalRub={2390} />)
    await vi.waitFor(() => expect(createSession).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(screen.getByText(SPLIT_FALLBACK_TEXT)).toBeInTheDocument()
  })

  it('сумма изменилась — новая сессия; при размонтировании виджет снят, сессия уничтожена', async () => {
    const { createSession, session } = stubYaPay()
    const view = render(<SplitWidget merchantId="merchant-public-id" totalRub={2000} />)
    await vi.waitFor(() => expect(session.mountWidget).toHaveBeenCalledTimes(1))
    view.rerender(<SplitWidget merchantId="merchant-public-id" totalRub={2390} />)
    await vi.waitFor(() => expect(session.mountWidget).toHaveBeenCalledTimes(2))
    expect(createSession.mock.calls[1]?.[0]).toMatchObject({ totalAmount: '2390.00' })
    expect(session.unmountWidget).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(session.unmountWidget).toHaveBeenCalledTimes(2)
    expect(session.destroy).toHaveBeenCalledTimes(2)
  })

  it('pay.js догрузился уже после выбора Сплита, onReady не пришёл — виджет всё равно монтируется', async () => {
    scriptMock.callOnReady = false
    render(<SplitWidget merchantId="merchant-public-id" totalRub={2390} />)
    await act(async () => {})
    expect(screen.getByText(SPLIT_FALLBACK_TEXT)).toBeInTheDocument()
    const { session } = stubYaPay()
    await vi.waitFor(() => expect(session.mountWidget).toHaveBeenCalledTimes(1), { timeout: 2000 })
  })

  it('SDK бросает при размонтировании — чекаут не падает', async () => {
    const { session } = stubYaPay()
    session.unmountWidget.mockImplementation(() => {
      throw new Error('detached')
    })
    session.destroy.mockImplementation(() => {
      throw new Error('destroyed')
    })
    const view = render(<SplitWidget merchantId="merchant-public-id" totalRub={2390} />)
    await vi.waitFor(() => expect(session.mountWidget).toHaveBeenCalledTimes(1))
    expect(() => view.unmount()).not.toThrow()
  })

  it('fallback={null} (карточка товара) — без текста-заглушки, пока виджета нет', async () => {
    render(<SplitWidget merchantId="merchant-public-id" totalRub={2390} fallback={null} />)
    await act(async () => {})
    expect(screen.queryByText(SPLIT_FALLBACK_TEXT)).toBeNull()
    expect(screen.getByTestId('split-widget')).toBeInTheDocument()
  })
})
