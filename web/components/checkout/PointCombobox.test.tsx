import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { CdekPoint } from '@ximi4ka-shop/shared'
import { PointCombobox, pointLabel } from './PointCombobox'

function point(code: string, address: string, workTime = 'Пн-Пт 10:00-20:00'): CdekPoint {
  return { code, name: `${code}, Москва`, address, location: [37.6, 55.7], workTime }
}

const MIRA = point('MSK310', 'пр-т Мира, 108', 'Пн-Вс 09:00-21:00')
const MANY = [
  ...Array.from({ length: 120 }, (_, i) => point(`MSK${1000 + i}`, `ул. Тестовая, ${i + 1}`)),
  MIRA,
]
const FEW = [point('MSK1', 'ул. Ленина, 1'), point('MSK2', 'ул. Ленина, 2'), MIRA]

function Controlled({
  points,
  onChange,
}: {
  points: CdekPoint[]
  onChange: (p: CdekPoint) => void
}) {
  const [value, setValue] = useState<CdekPoint | null>(null)
  return (
    <PointCombobox
      id="point"
      points={points}
      value={value}
      onChange={(p) => {
        setValue(p)
        onChange(p)
      }}
    />
  )
}

function input() {
  return screen.getByRole('combobox', { name: /пункт получения/i })
}

describe('<PointCombobox>', () => {
  it('при фокусе — первые 50 пунктов и «Показаны 50 из N — уточните запрос»', () => {
    render(<Controlled points={MANY} onChange={vi.fn()} />)
    fireEvent.focus(input())
    expect(screen.getAllByRole('option')).toHaveLength(50)
    expect(screen.getByText('Показаны 50 из 121 — уточните запрос')).toBeInTheDocument()
  })

  it('«мира 108» находит пункт; в строке код · адрес и часы работы', () => {
    render(<Controlled points={MANY} onChange={vi.fn()} />)
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'мира 108' } })
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('MSK310 · пр-т Мира, 108')
    expect(options[0]).toHaveTextContent('Пн-Вс 09:00-21:00')
    expect(screen.queryByText(/уточните запрос/)).toBeNull()
  })

  it('ничего не нашлось — подсказка, как искать', () => {
    render(<Controlled points={FEW} onChange={vi.fn()} />)
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'луна' } })
    expect(
      screen.getByText('Ничего не найдено — попробуйте часть адреса или код пункта'),
    ).toBeInTheDocument()
  })

  it('стрелки и Enter выбирают пункт, Enter не отправляет форму', () => {
    const onChange = vi.fn()
    render(<Controlled points={FEW} onChange={onChange} />)
    fireEvent.focus(input())
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(input()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]!.id)
    // false — у события вызван preventDefault: браузер не отправит форму.
    expect(fireEvent.keyDown(input(), { key: 'Enter' })).toBe(false)
    expect(onChange).toHaveBeenCalledWith(FEW[1])
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input()).toHaveValue('MSK2 · ул. Ленина, 2')
  })

  it('Enter без выделения при открытом списке тоже не отправляет форму', () => {
    render(<Controlled points={FEW} onChange={vi.fn()} />)
    fireEvent.focus(input())
    expect(fireEvent.keyDown(input(), { key: 'Enter' })).toBe(false)
  })

  it('Esc закрывает список и не меняет выбор', () => {
    const onChange = vi.fn()
    render(<Controlled points={FEW} onChange={onChange} />)
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'ленина' } })
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(input()).toHaveValue('')
  })

  it('клик по строке выбирает пункт; закрытое поле показывает его', () => {
    const onChange = vi.fn()
    render(<Controlled points={FEW} onChange={onChange} />)
    fireEvent.focus(input())
    fireEvent.click(screen.getByRole('option', { name: /MSK310/ }))
    expect(onChange).toHaveBeenCalledWith(MIRA)
    expect(input()).toHaveValue(pointLabel(MIRA))
  })

  it('показывает ошибку у поля', () => {
    render(
      <PointCombobox
        id="point"
        points={FEW}
        value={null}
        onChange={vi.fn()}
        error="Выберите пункт получения"
      />,
    )
    expect(screen.getByText('Выберите пункт получения')).toBeInTheDocument()
    expect(input()).toHaveAttribute('aria-invalid', 'true')
  })
})
