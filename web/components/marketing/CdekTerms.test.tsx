import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { CdekTerms } from './CdekTerms'

describe('<CdekTerms>', () => {
  it('выводит таблицу сроков с тремя регионами', () => {
    render(<CdekTerms />)
    const table = screen.getByRole('table', { name: 'Средние сроки доставки СДЭК' })
    const rows = within(table).getAllByRole('row')
    // шапка + три региона
    expect(rows).toHaveLength(4)
    expect(rows[1]).toHaveTextContent('Москва и Московская область, Ленинградская область')
    expect(rows[1]).toHaveTextContent('2–3 дня')
    expect(rows[2]).toHaveTextContent('Европейская часть России, Кавказ')
    expect(rows[2]).toHaveTextContent('3–5 дней')
    expect(rows[3]).toHaveTextContent('Сибирь, Забайкалье, Дальний Восток')
    expect(rows[3]).toHaveTextContent('7–10 дней')
  })

  it('размечает заголовки столбцов', () => {
    render(<CdekTerms />)
    expect(screen.getByRole('columnheader', { name: 'Регион' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Срок' })).toBeInTheDocument()
  })
})
