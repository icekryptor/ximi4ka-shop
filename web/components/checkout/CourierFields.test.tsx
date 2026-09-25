import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { EMPTY_COURIER_ADDRESS, type CourierAddress } from '@/lib/shipping'
import { CourierFields } from './CourierFields'

function Controlled({ onChange }: { onChange: (value: CourierAddress) => void }) {
  const [value, setValue] = useState<CourierAddress>(EMPTY_COURIER_ADDRESS)
  return (
    <CourierFields
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      errors={{}}
    />
  )
}

describe('<CourierFields>', () => {
  it('улица с домом, квартира и индекс собираются в адрес', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/улица, дом/i), { target: { value: 'Тверская ул., 1' } })
    fireEvent.change(screen.getByLabelText(/квартира/i), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText(/индекс/i), { target: { value: '125009' } })
    expect(onChange).toHaveBeenLastCalledWith({
      street: 'Тверская ул., 1',
      apartment: '12',
      postalCode: '125009',
    })
  })

  it('в индекс попадают только цифры, не больше шести', () => {
    render(<Controlled onChange={vi.fn()} />)
    const postal = screen.getByLabelText(/индекс/i)
    fireEvent.change(postal, { target: { value: '12-50 09 9' } })
    expect(postal).toHaveValue('125009')
  })

  it('вставка с пробелом («191 186») не теряет цифру — нет maxLength на сыром значении', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/индекс/i), { target: { value: '191 186' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ postalCode: '191186' }))
  })

  it('буква среди цифр («19a1186») отфильтровывается, не обрезает хвост', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/индекс/i), { target: { value: '19a1186' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ postalCode: '191186' }))
  })

  it('больше шести цифр — берутся первые шесть', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/индекс/i), { target: { value: '1234567890' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ postalCode: '123456' }))
  })

  it('показывает ошибки у полей', () => {
    render(
      <CourierFields
        value={{ street: '', apartment: '', postalCode: '123' }}
        onChange={vi.fn()}
        errors={{ street: 'Укажите улицу и дом', postalCode: 'Индекс — 6 цифр' }}
      />,
    )
    expect(screen.getByText('Укажите улицу и дом')).toBeInTheDocument()
    expect(screen.getByText('Индекс — 6 цифр')).toBeInTheDocument()
    expect(screen.getByLabelText(/улица, дом/i)).toHaveAttribute('aria-invalid', 'true')
  })
})
