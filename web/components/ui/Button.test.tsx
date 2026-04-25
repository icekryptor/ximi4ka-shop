import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  it('renders a <button> element by default', () => {
    render(<Button>В корзину</Button>)
    expect(screen.getByRole('button', { name: 'В корзину' })).toBeInTheDocument()
  })

  it('renders an anchor when href is provided', () => {
    render(<Button href="/categories">Каталог</Button>)
    const link = screen.getByRole('link', { name: 'Каталог' })
    expect(link).toHaveAttribute('href', '/categories')
  })

  it('applies primary gradient classes by default', () => {
    render(<Button>x</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-[var(--gradient-brand)]')
  })

  it('applies secondary border when variant=secondary', () => {
    render(<Button variant="secondary">x</Button>)
    expect(screen.getByRole('button')).toHaveClass('border')
  })

  it('applies ghost styles when variant=ghost', () => {
    render(<Button variant="ghost">x</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-transparent')
  })

  it('applies underline when variant=link', () => {
    render(<Button variant="link">x</Button>)
    expect(screen.getByRole('button')).toHaveClass('underline')
  })

  it('respects size prop (lg)', () => {
    render(<Button size="lg">x</Button>)
    expect(screen.getByRole('button')).toHaveClass('px-8')
  })

  it('respects size prop (xl)', () => {
    render(<Button size="xl">x</Button>)
    expect(screen.getByRole('button')).toHaveClass('px-10')
  })

  it('applies w-full when fullWidth', () => {
    render(<Button fullWidth>x</Button>)
    expect(screen.getByRole('button')).toHaveClass('w-full')
  })

  it('is disabled when disabled prop set', () => {
    render(<Button disabled>x</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows loading state', () => {
    render(<Button loading>Сохранить</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
    // Visually replaces children with spinner; the spinner should be detectable
    expect(screen.getByLabelText('Загрузка')).toBeInTheDocument()
  })

  it('forwards onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>x</Button>)
    screen.getByRole('button').click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
