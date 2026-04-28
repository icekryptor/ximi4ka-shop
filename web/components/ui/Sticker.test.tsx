import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sticker } from './Sticker'

describe('Sticker', () => {
  it('renders text', () => {
    render(<Sticker>Хит</Sticker>)
    expect(screen.getByText('Хит')).toBeInTheDocument()
  })

  it('uses accent variant by default', () => {
    const { container } = render(<Sticker>x</Sticker>)
    expect(container.firstChild).toHaveClass('bg-[var(--color-accent)]')
  })

  it('uses brand variant', () => {
    const { container } = render(<Sticker variant="brand">x</Sticker>)
    expect(container.firstChild).toHaveClass('bg-[var(--gradient-brand-deep)]')
  })

  it('uses dark variant', () => {
    const { container } = render(<Sticker variant="dark">x</Sticker>)
    expect(container.firstChild).toHaveClass('bg-[var(--color-dark-base)]')
  })

  it('uses success variant', () => {
    const { container } = render(<Sticker variant="success">x</Sticker>)
    expect(container.firstChild).toHaveClass('bg-[var(--color-stock-success)]')
  })

  it('applies wobble animation class when wobble prop set', () => {
    const { container } = render(<Sticker wobble>x</Sticker>)
    expect(container.firstChild).toHaveClass('animate-sticker-wobble')
  })

  it('omits wobble class by default', () => {
    const { container } = render(<Sticker>x</Sticker>)
    expect(container.firstChild).not.toHaveClass('animate-sticker-wobble')
  })

  it('applies rotation for natural sticker tilt', () => {
    const { container } = render(<Sticker>x</Sticker>)
    expect(container.firstChild).toHaveClass('-rotate-3')
  })

  it('forwards className for positioning by parent', () => {
    const { container } = render(<Sticker className="absolute top-2 right-2">x</Sticker>)
    expect(container.firstChild).toHaveClass('absolute', 'top-2', 'right-2')
  })
})
