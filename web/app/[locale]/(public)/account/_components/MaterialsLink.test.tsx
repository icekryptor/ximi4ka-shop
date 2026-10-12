import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MaterialsLink } from './MaterialsLink'

afterEach(cleanup)

describe('MaterialsLink', () => {
  it('ведёт в раздел «Мои материалы»', () => {
    render(<MaterialsLink />)
    expect(screen.getByRole('link', { name: /Мои материалы/ })).toHaveAttribute(
      'href',
      '/account/materials',
    )
  })
})
