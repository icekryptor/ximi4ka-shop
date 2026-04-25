import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionHeading } from './SectionHeading'

describe('SectionHeading', () => {
  it('renders title as h2 by default', () => {
    render(<SectionHeading title="Бестселлеры" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Бестселлеры' })).toBeInTheDocument()
  })

  it('renders eyebrow when provided', () => {
    render(<SectionHeading eyebrow="каталог" title="x" />)
    expect(screen.getByText('каталог')).toBeInTheDocument()
  })

  it('renders right-aligned action link when provided', () => {
    render(<SectionHeading title="x" action={{ label: 'Все', href: '/categories' }} />)
    const link = screen.getByRole('link', { name: 'Все →' })
    expect(link).toHaveAttribute('href', '/categories')
  })
})
