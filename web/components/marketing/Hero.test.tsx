import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hero } from './Hero'
import type { HeroSlide } from '@/lib/heroSlides'

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
  window.localStorage.clear()
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

const SLIDES: HeroSlide[] = [
  {
    productId: 'p1',
    slug: 'himichka-30',
    name: 'Химичка 3.0',
    priceRub: 3399,
    imageUrl: '/img/1.jpg',
    alt: 'Химичка 3.0',
    href: '/product/himichka-30',
  },
  {
    productId: 'p2',
    slug: 'mini-himichka',
    name: 'Мини-Химичка',
    priceRub: 1799,
    imageUrl: '/img/2.jpg',
    alt: 'Мини-Химичка',
    href: '/product/mini-himichka',
  },
]

const BASE = {
  title: 'ХИМИЧКА',
  subtitle: 'Наборы для опытов',
  lead: '3 набора: от реакций меди до электролиза.',
  primaryCta: { label: 'Открыть каталог', href: '/catalog' },
  secondaryCta: { label: 'Что мы делаем', href: '#manifesto' },
}

describe('<Hero> по макету Figma «Главная — 1440» (17:129)', () => {
  it('renders the two-line headline, lead and both CTAs', () => {
    render(<Hero {...BASE} />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/ХИМИЧКА.*Наборы для опытов/s)
    expect(screen.getByText('3 набора: от реакций меди до электролиза.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Открыть каталог/ })).toHaveAttribute(
      'href',
      '/catalog',
    )
    expect(screen.getByRole('link', { name: 'Что мы делаем' })).toHaveAttribute(
      'href',
      '#manifesto',
    )
  })

  it('is a solid purple section with rounded bottom corners', () => {
    const { container } = render(<Hero {...BASE} />)
    const section = container.querySelector('section')!
    expect(section.className).toContain('bg-[var(--color-lj-bright-start)]')
    expect(section.className).toContain('rounded-b-')
    expect(section.className).toContain('text-[var(--color-lj-on-bright)]')
  })

  it('sets the headline rows in Mazzard ExtraBold Italic and Light Italic', () => {
    render(<Hero {...BASE} />)
    const strong = screen.getByText('ХИМИЧКА')
    const light = screen.getByText('Наборы для опытов')
    expect(strong.className).toContain('font-lj-mazzard')
    expect(strong.className).toContain('font-[800]')
    expect(strong.className).toContain('italic')
    expect(light.className).toContain('font-[300]')
    expect(light.className).toContain('italic')
  })

  it('uses the white and light-outline buttons from the Button atom', () => {
    render(<Hero {...BASE} />)
    expect(screen.getByRole('link', { name: /Открыть каталог/ }).className).toContain(
      'lj-btn-white',
    )
    expect(screen.getByRole('link', { name: 'Что мы делаем' }).className).toContain(
      'lj-btn-outline-light',
    )
  })

  it('drops the old eyebrow, trail line and formula ticker', () => {
    const { container } = render(<Hero {...BASE} />)
    expect(screen.queryByText(/Опыты в коробке/)).toBeNull()
    expect(container.querySelector('[class*="lj-ticker"]')).toBeNull()
  })

  it('renders the hero slider with price + CTA when slides are provided', () => {
    render(<Hero {...BASE} slides={SLIDES} />)
    expect(screen.getByRole('group', { name: 'Флагманские наборы' })).toBeInTheDocument()
    expect(screen.getByText(/3\s399/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /В корзину/ })).toBeInTheDocument()
  })
})
