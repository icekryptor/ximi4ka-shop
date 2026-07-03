import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hero } from './Hero'
import type { HeroSlide } from '@/lib/heroSlides'

vi.mock('next/image', () => ({
  default: ({ fill, priority, sizes, ...rest }: Record<string, unknown>) => {
    void fill
    void priority
    void sizes
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
    label: 'fig. 001 — Химичка',
  },
  {
    productId: 'p2',
    slug: 'mini-himichka',
    name: 'Мини-Химичка',
    priceRub: 1799,
    imageUrl: '/img/2.jpg',
    alt: 'Мини-Химичка',
    href: '/product/mini-himichka',
    label: 'fig. 002 — Мини',
  },
]

describe('<Hero> v3', () => {
  it('renders headline rows with brand-purple emphasis word', () => {
    render(
      <Hero
        eyebrow="Опыты в коробке · Москва, с 2017"
        headlineRows={[
          { text: 'Опыт', emphasis: true },
          { text: 'вместо', offset: true },
          { text: 'объяснений' },
        ]}
        trailLine="— химия, которую держат в руках"
        lead="3 набора. От реакций меди до электролиза."
        primaryCta={{ label: 'Открыть каталог', href: '/catalog' }}
        secondaryCta={{ label: 'Что мы делаем', href: '#manifesto' }}
        tickerItems={['H₂O', 'NaCl']}
      />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Опыт.*вместо.*объяснений/s)
    expect(screen.getByText('— химия, которую держат в руках')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Открыть каталог/ })).toHaveAttribute(
      'href',
      '/catalog',
    )
  })

  it('emphasis row gets brand-purple italic class', () => {
    const { container } = render(
      <Hero
        eyebrow="x"
        headlineRows={[{ text: 'Опыт', emphasis: true }, { text: 'rest' }]}
        trailLine="t"
        lead="l"
        primaryCta={{ label: 'a', href: '/' }}
      />,
    )
    const emphasisSpan = container.querySelector('.lj-headline-emphasis')
    expect(emphasisSpan).not.toBeNull()
    expect(emphasisSpan?.textContent).toBe('Опыт')
  })

  it('renders the hero slider with price + CTA when slides are provided', () => {
    render(
      <Hero
        eyebrow="x"
        headlineRows={[{ text: 'Опыт', emphasis: true }]}
        trailLine="t"
        lead="l"
        primaryCta={{ label: 'Открыть каталог', href: '/catalog' }}
        slides={SLIDES}
      />,
    )
    expect(screen.getByRole('group', { name: 'Флагманские наборы' })).toBeInTheDocument()
    expect(screen.getByText(/3\s399/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /В корзину/ })).toBeInTheDocument()
  })

  it('shrinks the headline (no mega size) when a slider is present', () => {
    const { container } = render(
      <Hero
        eyebrow="x"
        headlineRows={[{ text: 'Опыт', emphasis: true }]}
        trailLine="t"
        lead="l"
        primaryCta={{ label: 'a', href: '/' }}
        slides={SLIDES}
      />,
    )
    const h1 = container.querySelector('h1')!
    expect(h1.className).not.toContain('var(--text-lj-mega)')
    expect(h1.className).toContain('clamp(2.5rem,5vw,5.5rem)')
  })
})
