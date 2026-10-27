import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CIS_PAYMENT_NOTE, CIS_PAYMENT_NOTE_FOREIGN_CARDS } from '@/lib/orderProcess'
import { CisDelivery } from './CisDelivery'
import { useCisDelivery } from './useCisDelivery'

afterEach(cleanup)

let model: ReturnType<typeof useCisDelivery>

function Harness({
  errors = {},
  foreignCards = false,
}: {
  errors?: Parameters<typeof CisDelivery>[0]['errors']
  foreignCards?: boolean
}) {
  const delivery = useCisDelivery()
  // eslint-disable-next-line react-hooks/globals
  model = delivery
  return <CisDelivery delivery={delivery} errors={errors} foreignCards={foreignCards} />
}

function options(select: HTMLElement): string[] {
  return Array.from(select.querySelectorAll('option')).map((o) => o.textContent ?? '')
}

describe('<CisDelivery>', () => {
  it('город недоступен, пока не выбрана страна', () => {
    render(<Harness />)
    expect(screen.getByLabelText(/город/i)).toBeDisabled()
  })

  it('после страны в списке города только этой страны', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'KZ' } })
    const list = options(screen.getByLabelText(/город/i))
    expect(list).toContain('Алматы')
    expect(list).not.toContain('Минск')
  })

  it('смена страны сбрасывает город', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'BY' } })
    fireEvent.change(screen.getByLabelText(/город/i), { target: { value: 'Минск' } })
    expect(model.city).toBe('Минск')
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'KZ' } })
    expect(model.city).toBe('')
    expect(screen.getByLabelText(/город/i)).toHaveValue('')
  })

  it('подсказка с ценой для выбранной страны', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'AM' } })
    expect(screen.getByText(/бесплатно от 5\D000\D*₽, иначе 1\D200\D*₽/i)).toBeInTheDocument()
    expect(
      screen.getByText(/нет вашего города\? доставка туда пока невозможна/i),
    ).toBeInTheDocument()
  })

  it('destination собирается только из страны, города из списка и адреса', () => {
    render(<Harness />)
    expect(model.destination).toBeNull()
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'BY' } })
    fireEvent.change(screen.getByLabelText(/город/i), { target: { value: 'Минск' } })
    expect(model.destination).toBeNull()
    fireEvent.change(screen.getByLabelText(/адрес пункта/i), {
      target: { value: '  ул. Ленина, 5 ' },
    })
    expect(model.destination).toEqual({
      method: 'cdek_manual_cis',
      country: 'BY',
      city: 'Минск',
      address: 'ул. Ленина, 5',
    })
  })

  it('shippingRub: null без страны, затем цена или 0 по порогу', () => {
    render(<Harness />)
    expect(model.shippingRub(2000)).toBeNull()
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'BY' } })
    expect(model.shippingRub(2000)).toBe(700)
    expect(model.shippingRub(3000)).toBe(0)
  })

  it('предупреждает, какими картами можно оплатить (до выбора страны)', () => {
    render(<Harness />)
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('Visa и Mastercard, выпущенными в России')
    expect(note).toHaveTextContent(
      'картами «Мир», выпущенными в Беларуси, Казахстане, Армении и Киргизии',
    )
    expect(note).toHaveTextContent('пока не принимаются')
    expect(note).toHaveTextContent(CIS_PAYMENT_NOTE)
  })

  it('при включённом CloudPayments — плашка про карты банков ЕАЭС отдельным способом', () => {
    render(<Harness foreignCards />)
    expect(screen.getByRole('note')).toHaveTextContent(CIS_PAYMENT_NOTE_FOREIGN_CARDS)
  })

  // Без ИИН (Казахстан) или ПИН (Киргизия) посылку не пропустит таможня.
  it('поле ИИН есть только у Казахстана, ПИН — у Киргизии', () => {
    render(<Harness />)
    expect(screen.queryByLabelText(/ИИН|ПИН/)).toBeNull()
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'BY' } })
    expect(screen.queryByLabelText(/ИИН|ПИН/)).toBeNull()
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'KZ' } })
    expect(screen.getByLabelText(/ИИН/)).toHaveAttribute('inputmode', 'numeric')
    expect(screen.getByText(/без него посылку не пропустит таможня/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'KG' } })
    expect(screen.queryByLabelText(/ИИН/)).toBeNull()
    expect(screen.getByLabelText(/ПИН/)).toBeInTheDocument()
  })

  it('destination для Казахстана — только с верным ИИН, номер без пробелов', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'KZ' } })
    fireEvent.change(screen.getByLabelText(/город/i), { target: { value: 'Алматы' } })
    fireEvent.change(screen.getByLabelText(/адрес пункта/i), { target: { value: 'ул. Абая, 1' } })
    expect(model.destination).toBeNull()
    fireEvent.change(screen.getByLabelText(/ИИН/), { target: { value: '850101300501' } })
    expect(model.destination).toBeNull()
    fireEvent.change(screen.getByLabelText(/ИИН/), { target: { value: '850101 300500' } })
    expect(model.destination).toEqual({
      method: 'cdek_manual_cis',
      country: 'KZ',
      city: 'Алматы',
      address: 'ул. Абая, 1',
      taxId: '850101300500',
    })
  })

  it('смена страны сбрасывает ИИН', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'KZ' } })
    fireEvent.change(screen.getByLabelText(/ИИН/), { target: { value: '850101300500' } })
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'KG' } })
    expect(model.taxId).toBe('')
  })

  it('показывает ошибку ИИН, пока номер неверен', () => {
    render(<Harness errors={{ cisTaxId: 'Укажите ИИН — без него посылку не пропустит таможня' }} />)
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'KZ' } })
    expect(
      screen.getByText('Укажите ИИН — без него посылку не пропустит таможня'),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/ИИН/), { target: { value: '850101300500' } })
    expect(screen.queryByText('Укажите ИИН — без него посылку не пропустит таможня')).toBeNull()
  })

  it('показывает ошибки полей', () => {
    render(
      <Harness
        errors={{
          country: 'Выберите страну',
          cisCity: 'Выберите город из списка',
          cisAddress: 'Укажите адрес пункта выдачи СДЭК',
        }}
      />,
    )
    expect(screen.getByText('Выберите страну')).toBeInTheDocument()
    expect(screen.getByText('Укажите адрес пункта выдачи СДЭК')).toBeInTheDocument()
  })
})
