import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hero } from './Hero'
import { buildPromoSlides } from '@/lib/promoSlides'

vi.mock('next/image', () => ({
  default: ({ fill, priority, sizes, unoptimized, ...rest }: Record<string, unknown>) => {
    void fill
    void priority
    void sizes
    void unoptimized
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(rest as Record<string, unknown>)} />
  },
}))

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
})

const BASE = {
  title: 'ХИМИЧКА',
  subtitle: 'Наборы для опытов',
  slides: buildPromoSlides(null),
}

describe('<Hero> — промо-слайдер первого экрана', () => {
  it('keeps a single page <h1> with the brand and topic', () => {
    render(<Hero {...BASE} />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('ХИМИЧКА — Наборы для опытов')
    expect(h1.className).toContain('sr-only')
  })

  it('shows the gift promo first, titled with an <h2>', () => {
    render(<Hero {...BASE} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Реактив в подарок' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Акции и новости' })).toBeInTheDocument()
  })

  it('is a solid purple section with rounded bottom corners', () => {
    const { container } = render(<Hero {...BASE} />)
    const section = container.querySelector('section')!
    expect(section.className).toContain('bg-[var(--color-lj-bright-start)]')
    expect(section.className).toContain('rounded-b-')
    expect(section.className).toContain('text-[var(--color-lj-on-bright)]')
  })

  it('uses the white button from the Button atom for the slide CTA', () => {
    render(<Hero {...BASE} />)
    expect(screen.getByRole('link', { name: /Выбрать набор/ }).className).toContain('lj-btn-white')
  })
})
