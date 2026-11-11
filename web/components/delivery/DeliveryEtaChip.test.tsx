import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import type { CdekCity } from '@ximi4ka-shop/shared'
import type { DeliveryDates } from '@ximi4ka-shop/shared/types/deliveryDates'

const mockGetEta = vi.fn<(cityCode?: number) => Promise<DeliveryDates | null>>()
const mockSuggest = vi.fn<(q: string) => Promise<CdekCity[]>>()
vi.mock('@/lib/api', () => ({
  getDeliveryEta: (cityCode?: number) => mockGetEta(cityCode),
  suggestCdekCities: (q: string) => mockSuggest(q),
}))

import { CITY_STORAGE_KEY, saveCity } from '@/lib/deliveryCity'
import { resetDeliveryEtaCacheForTests } from '@/lib/deliveryEta'
import { DeliveryEtaChip } from './DeliveryEtaChip'

const KAZAN: CdekCity = { code: 424, name: 'Казань', fullName: 'Казань, Татарстан, Россия' }
const TODAY = '2026-11-11'
const FASTEST: DeliveryDates = { today: TODAY, dateMin: '2026-11-13', dateMax: '2026-11-13' }
const TO_KAZAN: DeliveryDates = { today: TODAY, dateMin: '2026-11-15', dateMax: '2026-11-17' }

const CITY_HINT = 'Выберите город для более точного срока доставки'

beforeEach(() => {
  mockGetEta.mockImplementation(async (cityCode) => (cityCode === 424 ? TO_KAZAN : FASTEST))
  mockSuggest.mockResolvedValue([KAZAN])
})
afterEach(() => {
  window.localStorage.clear()
  resetDeliveryEtaCacheForTests()
  mockGetEta.mockReset()
  mockSuggest.mockReset()
})

describe('DeliveryEtaChip', () => {
  it('город не выбран — самый быстрый срок и подпись с просьбой выбрать город', async () => {
    render(<DeliveryEtaChip caption />)
    expect(await screen.findByTestId('delivery-eta-chip')).toHaveTextContent('послезавтра')
    expect(mockGetEta).toHaveBeenCalledWith(undefined)
    expect(screen.getByRole('button', { name: CITY_HINT })).toBeInTheDocument()
  })

  // Название города не склоняем («в Москва») — подпись без предлога.
  it('город выбран — срок до него и подпись «Казань · изменить город»', async () => {
    saveCity(KAZAN)
    render(<DeliveryEtaChip caption />)
    expect(await screen.findByTestId('delivery-eta-chip')).toHaveTextContent('15 ноября')
    expect(mockGetEta).toHaveBeenCalledWith(424)
    expect(screen.getByTestId('delivery-eta')).toHaveTextContent(/Казань\s*·\s*изменить город/)
    expect(screen.getByRole('button', { name: 'изменить город' })).toBeInTheDocument()
    expect(screen.queryByText(CITY_HINT)).not.toBeInTheDocument()
  })

  it('скринридер слышит не только дату: «Доставка: послезавтра»', async () => {
    render(<DeliveryEtaChip />)
    expect(await screen.findByTestId('delivery-eta-chip')).toHaveTextContent(
      'Доставка: послезавтра',
    )
  })

  it('без подписи (карточка каталога) — только чип, кнопок нет', async () => {
    render(<DeliveryEtaChip />)
    await screen.findByTestId('delivery-eta-chip')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('СДЭК не ответил — ни чипа, ни подписи; место остаётся, страница не прыгает', async () => {
    mockGetEta.mockResolvedValue(null)
    render(<DeliveryEtaChip caption />)
    await waitFor(() => expect(mockGetEta).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByTestId('delivery-eta')).toHaveAttribute('data-state', 'none'),
    )
    expect(screen.getByTestId('delivery-eta')).toBeEmptyDOMElement()
    expect(screen.getByTestId('delivery-eta').className).toContain('min-h-[48px]')
  })

  it('страница пришла с сервера, город сохранён — один запрос, сразу по городу', async () => {
    saveCity(KAZAN)
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = renderToString(<DeliveryEtaChip caption />)
    render(<DeliveryEtaChip caption />, { container, hydrate: true })
    expect(await screen.findByTestId('delivery-eta-chip')).toHaveTextContent('15 ноября')
    expect(mockGetEta).toHaveBeenCalledTimes(1)
    expect(mockGetEta).toHaveBeenCalledWith(424)
  })

  it('Escape при открытом списке городов закрывает список, окно остаётся', async () => {
    render(<DeliveryEtaChip caption />)
    fireEvent.click(await screen.findByRole('button', { name: CITY_HINT }))
    const field = screen.getByRole('combobox', { name: /город/i })
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: 'Каз' } })
    await screen.findByRole('option', { name: /Казань/ })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('окно закрыли — фокус возвращается на подпись, с которой его открыли', async () => {
    render(<DeliveryEtaChip caption />)
    const opener = await screen.findByRole('button', { name: CITY_HINT })
    fireEvent.click(opener)
    expect(screen.getByRole('combobox', { name: /город/i })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByRole('button', { name: CITY_HINT })).toHaveFocus()
  })

  it('город выбран — подпись и фокус на месте, пока срок пересчитывается', async () => {
    render(<DeliveryEtaChip caption />)
    fireEvent.click(await screen.findByRole('button', { name: CITY_HINT }))
    fireEvent.change(screen.getByRole('combobox', { name: /город/i }), {
      target: { value: 'Каз' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /Казань/ }))
    expect(screen.getByRole('button', { name: 'изменить город' })).toHaveFocus()
    await waitFor(() =>
      expect(screen.getByTestId('delivery-eta-chip')).toHaveTextContent('15 ноября'),
    )
  })

  it('Tab не уводит из окна на страницу под ним', async () => {
    render(<DeliveryEtaChip caption />)
    fireEvent.click(await screen.findByRole('button', { name: CITY_HINT }))
    const field = screen.getByRole('combobox', { name: /город/i })
    const close = screen.getByRole('button', { name: 'Закрыть окно' })
    // Поле — первое в окне, «закрыть» — последнее: с краёв Tab идёт по кругу.
    expect(field).toHaveFocus()
    fireEvent.keyDown(field, { key: 'Tab', shiftKey: true })
    expect(close).toHaveFocus()
    fireEvent.keyDown(close, { key: 'Tab' })
    expect(field).toHaveFocus()
  })

  it('выбор города: подпись открывает поле, город запоминается для чекаута, срок пересчитан', async () => {
    render(<DeliveryEtaChip caption />)
    fireEvent.click(await screen.findByRole('button', { name: CITY_HINT }))
    const field = screen.getByRole('combobox', { name: /город/i })
    fireEvent.change(field, { target: { value: 'Каз' } })
    fireEvent.click(await screen.findByRole('option', { name: /Казань/ }))

    await waitFor(() =>
      expect(screen.getByTestId('delivery-eta-chip')).toHaveTextContent('15 ноября'),
    )
    expect(JSON.parse(window.localStorage.getItem(CITY_STORAGE_KEY)!)).toEqual(KAZAN)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('delivery-eta')).toHaveTextContent(/Казань\s*·\s*изменить город/)
  })

  it('окно выбора города закрывается по Escape, город не меняется', async () => {
    render(<DeliveryEtaChip caption />)
    fireEvent.click(await screen.findByRole('button', { name: CITY_HINT }))
    expect(screen.getByRole('dialog', { name: 'Город доставки' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(CITY_STORAGE_KEY)).toBeNull()
  })

  it('два чипа на странице делят один запрос и оба видят новый город', async () => {
    render(
      <>
        <DeliveryEtaChip />
        <DeliveryEtaChip caption />
      </>,
    )
    expect(await screen.findAllByTestId('delivery-eta-chip')).toHaveLength(2)
    expect(mockGetEta).toHaveBeenCalledTimes(1)
  })
})
