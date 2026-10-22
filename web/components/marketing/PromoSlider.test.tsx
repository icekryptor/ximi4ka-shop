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
    vi.useFakeTimers()
    const { container } = render(<PromoSlider slides={SLIDES} autoPlayMs={0} />)
    act(() => {
      vi.advanceTimersByTime(10)
    })
    const srcs = Array.from(container.querySelectorAll('img[src*="/img/promo/"]')).map((img) =>
      img.getAttribute('src'),
    )
    expect(srcs).toEqual(
      expect.arrayContaining([
        '/img/promo/gift-kit-oge.webp',
        '/img/promo/oge-box.webp',
        '/img/promo/learn-tablet-1.webp',
      ]),
    )
    container.querySelectorAll('img[src*="/img/promo/"]').forEach((img) => {
      expect(img.closest('[aria-hidden="true"]')).not.toBeNull()
    })
  })

  it('до загрузки страницы рисует иллюстрации только активного слайда', () => {
    vi.useFakeTimers()
    const { container } = render(<PromoSlider slides={SLIDES} autoPlayMs={0} />)
    // Скрытые слайды лежат в той же ячейке сетки, так что lazy-картинки в них
    // «видны» браузеру и качались до LCP, деля канал с главной картинкой.
    expect(container.querySelector('img[src*="gift-kit-oge.webp"]')).not.toBeNull()
    expect(container.querySelector('img[src*="oge-box.webp"]')).toBeNull()
    expect(container.querySelector('img[src*="learn-tablet"]')).toBeNull()
    // Каркас слайда на месте: высота не прыгает, когда картинки подгрузятся.
    expect(container.querySelectorAll('[aria-roledescription="слайд"]')).toHaveLength(3)
    act(() => {
      vi.advanceTimersByTime(10)
    })
    expect(container.querySelector('img[src*="oge-box.webp"]')).not.toBeNull()
  })

  it('рисует иллюстрации скрытых слайдов, когда страница уже загружена', () => {
    vi.useFakeTimers()
    const { container } = render(<PromoSlider slides={SLIDES} autoPlayMs={0} />)
    act(() => {
      vi.advanceTimersByTime(10)
    })
    expect(container.querySelector('img[src*="learn-tablet-1.webp"]')).not.toBeNull()
  })

  it('показывает иллюстрацию слайда сразу, если на него переключились до загрузки', () => {
    vi.useFakeTimers()
    const { container } = render(<PromoSlider slides={SLIDES} autoPlayMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Следующий слайд' }))
    expect(container.querySelector('img[src*="oge-box.webp"]')).not.toBeNull()
  })

  it('loads the first banner hero (the LCP image) eagerly with high fetch priority', () => {
    const { container } = render(<PromoSlider slides={SLIDES} autoPlayMs={0} />)
    const hero = container.querySelector('img[src*="gift-kit-oge.webp"]')
    expect(hero).not.toBeNull()
    expect(hero).toHaveAttribute('fetchpriority', 'high')
    expect(hero).toHaveAttribute('loading', 'eager')
    // остальные иллюстрации не должны отбирать у неё канал
    container
      .querySelectorAll('img[src*="/img/promo/"]:not([src*="gift-kit-oge.webp"])')
      .forEach((img) => {
        expect(img).not.toHaveAttribute('fetchpriority')
      })
  })

  it('не листает сам, пока посетитель ничего не сделал: иначе второй баннер становится LCP', () => {
    vi.useFakeTimers()
    render(<PromoSlider slides={SLIDES} autoPlayMs={1000} />)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText('1 / 3')).toBeInTheDocument()

    act(() => {
      fireEvent.scroll(window)
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it.each([
    ['касание', () => fireEvent.pointerDown(window)],
    ['клавиша', () => fireEvent.keyDown(window, { key: 'Tab' })],
    ['тач', () => fireEvent.touchStart(window)],
  ])('запускает автопрокрутку после первого действия: %s', (_, interact) => {
    vi.useFakeTimers()
    render(<PromoSlider slides={SLIDES} autoPlayMs={1000} />)
    act(() => {
      interact()
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('движение мыши автопрокрутку не запускает: оно не завершает поиск LCP', () => {
    vi.useFakeTimers()
    render(<PromoSlider slides={SLIDES} autoPlayMs={1000} />)
    act(() => {
      fireEvent.mouseMove(window)
      vi.advanceTimersByTime(2500)
    })
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('не использует backdrop-filter: на серверах PSI без GPU размытие задерживает первый кадр', () => {
    vi.useFakeTimers()
    const { container } = render(<PromoSlider slides={SLIDES} autoPlayMs={0} />)
    // jsdom уже в readyState=complete: иллюстрации всех слайдов подключаются по таймеру
    act(() => {
      vi.advanceTimersByTime(10)
    })
    expect(container.querySelectorAll('img[src*="gift-naoh-2"]')).toHaveLength(1)
    expect(container.innerHTML).not.toMatch(/backdrop/)
  })

  it('restarts the autoplay countdown after a manual switch', () => {
    vi.useFakeTimers()
    render(<PromoSlider slides={SLIDES} autoPlayMs={1000} />)
    act(() => {
      fireEvent.scroll(window)
    })
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
      fireEvent.scroll(window)
    })
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
      fireEvent.scroll(window)
    })
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
