import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { MobileMenuOverlay } from './MobileMenuOverlay'

afterEach(() => {
  cleanup()
})

const NAV = [
  { href: '/categories', label: 'Каталог', desc: 'найти набор' },
  { href: '/o-nas', label: 'О нас', desc: 'наша лаборатория' },
]

describe('<MobileMenuOverlay>', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <MobileMenuOverlay open={false} onClose={() => {}} pathname="/" navItems={NAV} cartCount={0} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders all nav items with mono index, label, and description when open', () => {
    render(
      <MobileMenuOverlay open={true} onClose={() => {}} pathname="/" navItems={NAV} cartCount={0} />
    )
    expect(screen.getByText('Каталог')).toBeInTheDocument()
    expect(screen.getByText('найти набор')).toBeInTheDocument()
    expect(screen.getByText(/01\s*\//)).toBeInTheDocument()
    expect(screen.getByText(/02\s*\//)).toBeInTheDocument()
  })

  it('calls onClose when × close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <MobileMenuOverlay open={true} onClose={onClose} pathname="/" navItems={NAV} cartCount={0} />
    )
    fireEvent.click(screen.getByRole('button', { name: /закрыть/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows cart count when > 0', () => {
    render(
      <MobileMenuOverlay open={true} onClose={() => {}} pathname="/" navItems={NAV} cartCount={3} />
    )
    expect(screen.getByText(/корзина.*3/i)).toBeInTheDocument()
  })

  it('shows (0) when cart empty', () => {
    render(
      <MobileMenuOverlay open={true} onClose={() => {}} pathname="/" navItems={NAV} cartCount={0} />
    )
    expect(screen.getByText(/корзина.*0/i)).toBeInTheDocument()
  })
})
