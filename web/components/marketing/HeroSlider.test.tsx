import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { HeroSlider } from './HeroSlider'
import type { HeroSlide } from '@/lib/heroSlides'

// next/image → простой <img>, чтобы тесты не тянули оптимизацию.
vi.mock('next/image', () => ({
  default: ({ fill, priority, sizes, ...rest }: Record<string, unknown>) => {
    void fill
    void priority
    void sizes
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(rest as Record<string, unknown>)} />
  },
}))

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
  {
    productId: 'p3',
    slug: 'elektrohimichka',
    name: 'Электрохимичка',
    priceRub: 3299,
    imageUrl: '/img/3.jpg',
    alt: 'Электрохимичка',
    href: '/product/elektrohimichka',
    label: 'fig. 003 — Электро',
  },
]

beforeEach(() => {
  window.localStorage.clear()
  // По умолчанию reduced-motion выключен.
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

describe('<HeroSlider>', () => {
  it('renders the first slide with price and CTA', () => {
    render(<HeroSlider slides={SLIDES} autoPlayMs={0} />)
    expect(screen.getByText(/3\s399/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /В корзину/ })).toBeInTheDocument()
    // Индикатор «1 / 3»
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('advances to the next slide via the arrow button', () => {
    render(<HeroSlider slides={SLIDES} autoPlayMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Следующий набор' }))
    expect(screen.getByText(/1\s799/)).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('wraps around from the first slide to the last on prev', () => {
    render(<HeroSlider slides={SLIDES} autoPlayMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий набор' }))
    expect(screen.getByText(/3\s299/)).toBeInTheDocument()
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
  })

  it('jumps to a slide when a dot is clicked', () => {
    render(<HeroSlider slides={SLIDES} autoPlayMs={0} />)
    fireEvent.click(screen.getByRole('tab', { name: /Набор 3:/ }))
    expect(screen.getByText(/3\s299/)).toBeInTheDocument()
  })

  it('supports keyboard arrows', () => {
    render(<HeroSlider slides={SLIDES} autoPlayMs={0} />)
    const region = screen.getByRole('group', { name: 'Флагманские наборы' })
    fireEvent.keyDown(region, { key: 'ArrowRight' })
    expect(screen.getByText(/1\s799/)).toBeInTheDocument()
    fireEvent.keyDown(region, { key: 'ArrowLeft' })
    expect(screen.getByText(/3\s399/)).toBeInTheDocument()
  })

  it('adds the active slide to the cart', () => {
    render(<HeroSlider slides={SLIDES} autoPlayMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: /В корзину/ }))
    const raw = window.localStorage.getItem('ximi4ka-shop-cart')
    expect(raw).toBeTruthy()
    const items = JSON.parse(raw!)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ productId: 'p1', priceRub: 3399, quantity: 1 })
  })

  it('advances on left swipe', () => {
    render(<HeroSlider slides={SLIDES} autoPlayMs={0} />)
    const region = screen.getByRole('group', { name: 'Флагманские наборы' })
    fireEvent.touchStart(region, { touches: [{ clientX: 200 }] })
    fireEvent.touchEnd(region, { changedTouches: [{ clientX: 120 }] })
    expect(screen.getByText(/1\s799/)).toBeInTheDocument()
  })

  it('renders nothing when given no slides', () => {
    const { container } = render(<HeroSlider slides={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('hides arrows and dots for a single slide', () => {
    render(<HeroSlider slides={[SLIDES[0]]} autoPlayMs={0} />)
    expect(screen.queryByRole('button', { name: 'Следующий набор' })).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('current slide image uses object-cover (rounded photo, no square corners)', () => {
    render(<HeroSlider slides={SLIDES} autoPlayMs={0} />)
    const img = within(screen.getByRole('group', { name: 'Флагманские наборы' })).getByRole('img')
    expect(img.className).toContain('object-cover')
  })
})
