import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BlackFridayChip } from './BlackFridayChip'

const during = new Date('2026-11-20T12:00:00+03:00')
const before = new Date('2026-11-12T12:00:00+03:00')

describe('<BlackFridayChip>', () => {
  it('в даты акции у набора из списка — чип «ЧП», для скринридера «Чёрная пятница»', () => {
    render(<BlackFridayChip slug="himichka-30" now={during} />)
    const chip = screen.getByTestId('black-friday-chip')
    expect(chip).toHaveTextContent('ЧП')
    expect(chip).toHaveTextContent('Чёрная пятница')
  })

  it('до 13.11 чипа нет', () => {
    render(<BlackFridayChip slug="himichka-30" now={before} />)
    expect(screen.queryByTestId('black-friday-chip')).toBeNull()
  })

  it('у товара не из списка чипа нет', () => {
    render(<BlackFridayChip slug="sernaya-kislota" now={during} />)
    expect(screen.queryByTestId('black-friday-chip')).toBeNull()
  })
})
