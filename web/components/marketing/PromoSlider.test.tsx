import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { PromoSlider } from './PromoSlider'
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

let reducedMotion = false

beforeEach(() => {
  reducedMotion = false
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes('reduced-motion') ? reducedMotion : false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
})

afterEach(() => {
  vi.useRealTimers()
})

const SLIDES = buildPromoSlides()

describe('<PromoSlider>', () => {
  it('renders all three slides, only the first one exposed to assistive tech', () => {
    render(<PromoSlider slides={SLIDES} autoPlayMs={0} />)
    // Неактивные слайды в DOM (текст для индексации), но aria-hidden.
    expect(
      screen.getByRole('heading', { name: 'Реактив в подарок за заказ от 3000 руб' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Новый набор: Химичка ОГЭ' })).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'Новый набор: Химичка ОГЭ', hidden: true }),
    ).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('shows the gift slide copy and CTA to the catalog', () => {
    render(<PromoSlider slides={SLIDES} autoPlayMs={0} />)
    expect(screen.getByText(/любой реактив на выбор за заказ от 3000 рублей/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /В каталог/ })).toHaveAttribute('href', '/catalog')
  })

  it('advances with the arrow and wraps around in both directions', () => {
    render(<PromoSlider slides={SLIDES} autoPlayMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Следующий слайд' }))
    expect(screen.getByRole('heading', { name: 'Новый набор: Химичка ОГЭ' })).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Подробнее/ })).toHaveAttribute(
      'href',
      '/product/bolshoi-nabor-dlya-oge',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий слайд' }))
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий слайд' }))
    expect(screen.getByRole('heading', { name: 'Наша обучающая платформа' })).toBeInTheDocument()
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
  })

  it('jumps to a slide via the dots', () => {
    render(<PromoSlider slides={SLIDES} autoPlayMs={0} />)
    fireEvent.click(screen.getByRole('tab', { name: /Слайд 3/ }))
    expect(screen.getByRole('heading', { name: 'Наша обучающая платформа' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Слайд 3/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('opens the learn platform in a new tab safely', () => {
    render(<PromoSlider slides={SLIDES} autoPlayMs={0} />)
    fireEvent.click(screen.getByRole('tab', { name: /Слайд 3/ }))
    const link = screen.getByRole('link', { name: /Подробнее/ })
    expect(link).toHaveAttribute('href', 'https://learn.ximi4ka.ru')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('draws the banner illustrations from /img/promo, hidden from assistive tech', () => {
    const { container } = render(<PromoSlider slides={SLIDES} autoPlayMs={0} />)
    const srcs = Array.from(container.querySelectorAll('img[src*="/img/promo/"]')).map((img) =>
      img.getAttribute('src'),
    )
    expect(srcs).toEqual(
      expect.arrayContaining([
        '/img/promo/gift-box.webp',
        '/img/promo/oge-box.webp',
        '/img/promo/learn-tablet-1.webp',
      ]),
    )
    container.querySelectorAll('img[src*="/img/promo/"]').forEach((img) => {
      expect(img.closest('[aria-hidden="true"]')).not.toBeNull()
    })
  })

  it('restarts the autoplay countdown after a manual switch', () => {
    vi.useFakeTimers()
    render(<PromoSlider slides={SLIDES} autoPlayMs={1000} />)
    act(() => {
      vi.advanceTimersByTime(900)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Следующий слайд' }))
    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
  })

  it('reacts to ArrowRight / ArrowLeft on the carousel', () => {
    render(<PromoSlider slides={SLIDES} autoPlayMs={0} />)
    const carousel = screen.getByRole('group', { name: 'Акции и новости' })
    fireEvent.keyDown(carousel, { key: 'ArrowRight' })
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    fireEvent.keyDown(carousel, { key: 'ArrowLeft' })
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('swipes on touch devices', () => {
    render(<PromoSlider slides={SLIDES} autoPlayMs={0} />)
    const carousel = screen.getByRole('group', { name: 'Акции и новости' })
    fireEvent.touchStart(carousel, { touches: [{ clientX: 300 }] })
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 200 }] })
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('autoplays, pauses on hover and stops under prefers-reduced-motion', () => {
    vi.useFakeTimers()
    const { unmount } = render(<PromoSlider slides={SLIDES} autoPlayMs={1000} />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('2 / 3')).toBeInTheDocument()

    const carousel = screen.getByRole('group', { name: 'Акции и новости' })
    fireEvent.mouseEnter(carousel)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    unmount()

    reducedMotion = true
    render(<PromoSlider slides={SLIDES} autoPlayMs={1000} />)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('renders nothing for an empty list and no controls for a single slide', () => {
    const { container, rerender } = render(<PromoSlider slides={[]} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<PromoSlider slides={[SLIDES[0]]} autoPlayMs={0} />)
    expect(screen.queryByRole('button', { name: 'Следующий слайд' })).toBeNull()
  })
})
