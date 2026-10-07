import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Product, SearchProductResult } from '@ximi4ka-shop/shared'

const mockCategories = vi.fn()
const mockByCategory = vi.fn()
vi.mock('@/lib/api', () => ({
  listCategories: (opts?: unknown) => mockCategories(opts),
  listProductsByCategory: (slug: string, opts?: unknown) => mockByCategory(slug, opts),
}))

import { WholesalePicker } from './WholesalePicker'

const category = (slug: string, name: string) => ({ id: `c-${slug}`, slug, name })
const CATEGORIES = [
  category('kits', 'Наборы'),
  category('combo', 'Комбо'),
  category('reagents', 'Реактивы'),
  category('equipment', 'Лабораторное оборудование'),
  category('print', 'Печатная продукция'),
]

function product(slug: string, name: string, priceRub: number, extra: Partial<Product> = {}) {
  return {
    id: `id-${slug}`,
    slug,
    name,
    priceRub,
    stockStatus: 'in_stock',
    images: [{ id: `i-${slug}`, url: `/uploads/${slug}.png`, alt: name, sortOrder: 0 }],
    ...extra,
  } as unknown as Product
}

const KITS = [
  product('himichka-30', 'Химичка 3.0', 3099),
  product('elektrohimichka', 'Электрохимичка', 3099),
  product('mini-himichka', 'Мини-Химичка', 1699),
  product('bolshoi-nabor-dlya-oge', 'Набор для ОГЭ', 3490),
]
const REAGENTS = [
  product('copper-sulfate', 'Сульфат меди', 100),
  product('rare', 'Редкий реактив', 100, { stockStatus: 'out_of_stock' }),
]
const EQUIPMENT = [product('probirka', 'Пробирка', 29), product('tripod', 'Штатив', 149)]

const page = (items: Product[]) => ({
  data: items,
  pagination: { limit: 100, offset: 0, total: items.length },
})

// Состояние IntersectionObserver задаёт тест: по умолчанию блок «уже виден».
let intersectNow = true
const observers: { cb: IntersectionObserverCallback; el: Element }[] = []
class FakeObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    observers.push({ cb: this.cb, el })
    if (intersectNow) this.fire(el)
  }
  fire(el: Element) {
    this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as never)
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

class FakePointerEvent extends MouseEvent {
  pointerType: string
  pointerId: number
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerType = init.pointerType ?? 'mouse'
    this.pointerId = init.pointerId ?? 1
  }
}

function setup(addedIds: string[] = [], onPick: (p: SearchProductResult) => void = vi.fn()) {
  const utils = render(<WholesalePicker addedIds={new Set(addedIds)} onPick={onPick} />)
  return { ...utils, onPick }
}

beforeEach(() => {
  intersectNow = true
  observers.length = 0
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  vi.stubGlobal('PointerEvent', FakePointerEvent)
  mockCategories.mockReset()
  mockByCategory.mockReset()
  mockCategories.mockResolvedValue({ data: CATEGORIES, pagination: {} })
  mockByCategory.mockImplementation(async (slug: string) =>
    page({ kits: KITS, reagents: REAGENTS, equipment: EQUIPMENT }[slug] ?? []),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const cards = () => screen.getAllByRole('article')
const track = () => screen.getByTestId('wholesale-picker-track')

/**
 * jsdom не считает раскладку: задаём геометрию дорожки и карточек. scrollLeft
 * живой (с границами), scrollBy его двигает — можно проверять, куда доехали.
 */
function mockGeometry(
  el: HTMLElement,
  { scrollLeft, clientWidth, scrollWidth, step = 100 }: Record<string, number>,
) {
  let position = scrollLeft
  const clamp = (v: number) => Math.max(0, Math.min(scrollWidth - clientWidth, v))
  Object.defineProperty(el, 'scrollLeft', {
    get: () => position,
    set: (v: number) => {
      position = clamp(v)
    },
    configurable: true,
  })
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
  within(el)
    .getAllByRole('listitem')
    .forEach((li, i) => Object.defineProperty(li, 'offsetLeft', { value: i * step }))
  const scrollBy = vi.fn(({ left = 0 }: ScrollToOptions) => {
    position = clamp(position + left)
  })
  el.scrollBy = scrollBy as unknown as typeof el.scrollBy
  return scrollBy
}

describe('WholesalePicker: вкладки', () => {
  it('показывает вкладки наборов, реактивов и оборудования с названиями из API', async () => {
    setup()
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Наборы',
      'Реактивы',
      'Лабораторное оборудование',
    ])
    expect(screen.queryByRole('tab', { name: 'Комбо' })).toBeNull()
    expect(screen.queryByRole('tab', { name: /Печат/ })).toBeNull()
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('по умолчанию выбраны «Наборы» и их товары', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    expect(mockByCategory).toHaveBeenCalledTimes(1)
    expect(mockByCategory).toHaveBeenCalledWith('kits', expect.anything())
    expect(cards()).toHaveLength(4)
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { name: 'Наборы' }).id)
  })

  it('клик по вкладке переключает товары', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    fireEvent.click(screen.getByRole('tab', { name: 'Реактивы' }))
    await screen.findByText('Сульфат меди')
    expect(screen.getByRole('tab', { name: 'Реактивы' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Наборы' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByText('Химичка 3.0')).toBeNull()
  })

  it('стрелки влево/вправо переключают вкладки и переносят фокус', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    const kits = screen.getByRole('tab', { name: 'Наборы' })
    kits.focus()
    fireEvent.keyDown(kits, { key: 'ArrowRight' })
    const reagents = screen.getByRole('tab', { name: 'Реактивы' })
    expect(reagents).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(reagents)
    expect(reagents).toHaveAttribute('tabindex', '0')
    expect(kits).toHaveAttribute('tabindex', '-1')
    await screen.findByText('Сульфат меди')

    fireEvent.keyDown(reagents, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Наборы' })).toHaveAttribute('aria-selected', 'true')
    // с первой вкладки влево — на последнюю
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Наборы' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: /оборудование/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    fireEvent.keyDown(screen.getByRole('tab', { name: /оборудование/ }), { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'Наборы' })).toHaveAttribute('aria-selected', 'true')
  })

  it('вкладка, которой нет в API, не показывается', async () => {
    mockCategories.mockResolvedValue({
      data: [category('kits', 'Наборы'), category('reagents', 'Реактивы')],
    })
    setup()
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(2))
  })

  it('без ответа API категорий вкладки остаются с запасными названиями', async () => {
    mockCategories.mockRejectedValue(new Error('offline'))
    setup()
    await screen.findByText('Химичка 3.0')
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })
})

describe('WholesalePicker: загрузка', () => {
  it('не грузит, пока блок вне зоны видимости, и начинает, когда он появился', async () => {
    intersectNow = false
    setup()
    expect(mockCategories).not.toHaveBeenCalled()
    expect(mockByCategory).not.toHaveBeenCalled()
    expect(screen.getByRole('status', { name: 'Загрузка' })).toBeInTheDocument()

    act(() => {
      new FakeObserver(observers[0].cb).fire(observers[0].el)
    })
    await screen.findByText('Химичка 3.0')
    expect(mockByCategory).toHaveBeenCalledTimes(1)
  })

  it('без IntersectionObserver грузит сразу после гидратации', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    setup()
    await screen.findByText('Химичка 3.0')
  })

  it('пока идёт загрузка, показывает скелетон из трёх карточек', async () => {
    let release: (v: unknown) => void = () => {}
    mockByCategory.mockReturnValue(new Promise((resolve) => (release = resolve)))
    setup()
    const status = await screen.findByRole('status', { name: 'Загрузка' })
    expect(status).toBeInTheDocument()
    expect(screen.getAllByTestId('wholesale-picker-skeleton')).toHaveLength(3)
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    await act(async () => release(page(KITS)))
    expect(screen.queryByRole('status', { name: 'Загрузка' })).toBeNull()
    expect(cards()).toHaveLength(4)
  })

  it('ошибка: сообщение и «Повторить» запрашивает ту же категорию снова', async () => {
    mockByCategory.mockRejectedValueOnce(new Error('500'))
    setup()
    const retry = await screen.findByRole('button', { name: 'Повторить' })
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить')
    fireEvent.click(retry)
    await screen.findByText('Химичка 3.0')
    expect(mockByCategory).toHaveBeenCalledTimes(2)
    expect(mockByCategory).toHaveBeenLastCalledWith('kits', expect.anything())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('пустая категория: сообщение вместо карточек и без стрелок', async () => {
    mockByCategory.mockResolvedValue(page([]))
    setup()
    await screen.findByText('Здесь пока нет товаров')
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Вперёд' })).toBeNull()
  })

  it('кеширует вкладки: повторное переключение не перезапрашивает', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    fireEvent.click(screen.getByRole('tab', { name: 'Реактивы' }))
    await screen.findByText('Сульфат меди')
    fireEvent.click(screen.getByRole('tab', { name: 'Наборы' }))
    expect(screen.getByText('Химичка 3.0')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Реактивы' }))
    expect(screen.getByText('Сульфат меди')).toBeInTheDocument()
    expect(mockByCategory.mock.calls.map((c) => c[0])).toEqual(['kits', 'reagents'])
    expect(mockCategories).toHaveBeenCalledTimes(1)
  })

  it('ошибку вкладки можно повторить, не трогая закешированные', async () => {
    mockByCategory.mockImplementation(async (slug: string) => {
      if (slug === 'reagents' && mockByCategory.mock.calls.filter((c) => c[0] === slug).length < 2)
        throw new Error('boom')
      return page(slug === 'kits' ? KITS : REAGENTS)
    })
    setup()
    await screen.findByText('Химичка 3.0')
    fireEvent.click(screen.getByRole('tab', { name: 'Реактивы' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Повторить' }))
    await screen.findByText('Сульфат меди')
    fireEvent.click(screen.getByRole('tab', { name: 'Наборы' }))
    expect(screen.getByText('Химичка 3.0')).toBeInTheDocument()
    expect(mockByCategory.mock.calls.map((c) => c[0])).toEqual(['kits', 'reagents', 'reagents'])
  })
})

describe('WholesalePicker: карточки', () => {
  it('в карточке: название, цена и «от N ₽/шт» с количеством ступени', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    const card = cards()[0]
    expect(card).toHaveTextContent('Химичка 3.0')
    expect(card).toHaveTextContent(/3\s099\s₽/)
    // 3099 − 299 = 2800 на первой ступени (от 5 шт)
    expect(card).toHaveTextContent(/от\s2\s800\s₽\/шт/)
    expect(card).toHaveTextContent('при заказе от 5 шт')
  })

  it('фото ленивое, с sizes, а у карточки без фото — заглушка', async () => {
    mockByCategory.mockResolvedValue(
      page([KITS[0], product('no-photo', 'Без фото', 100, { images: [] })]),
    )
    setup()
    await screen.findByText('Химичка 3.0')
    const img = cards()[0].querySelector('img')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('sizes')
    expect(cards()[1].querySelector('img')).toBeNull()
  })

  it('«В список» отдаёт товар в том же виде, что и подсказка поиска', async () => {
    const { onPick } = setup()
    await screen.findByText('Химичка 3.0')
    fireEvent.click(screen.getByRole('tab', { name: 'Реактивы' }))
    await screen.findByText('Сульфат меди')
    fireEvent.click(within(cards()[0]).getByRole('button', { name: /В список/ }))
    expect(onPick).toHaveBeenCalledWith({
      id: 'id-copper-sulfate',
      slug: 'copper-sulfate',
      name: 'Сульфат меди',
      priceRub: 100,
      image: '/uploads/copper-sulfate.png',
      stockStatus: 'in_stock',
      categories: ['reagents'],
    })
  })

  it('позиция, уже лежащая в списке: «В списке», повторный клик ничего не ломает', async () => {
    const { onPick } = setup(['id-himichka-30'])
    await screen.findByText('Химичка 3.0')
    const added = within(cards()[0]).getByRole('button', { name: /В списке/ })
    expect(added).toHaveAttribute('aria-disabled', 'true')
    expect(within(cards()[1]).getByRole('button', { name: /В список$/ })).not.toHaveAttribute(
      'aria-disabled',
    )
    // клик ведёт себя как повторный выбор подсказки: уходит в тот же onPick,
    // а он не дублирует строку (проверено в тесте WholesaleOrder)
    fireEvent.click(added)
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('«Нет в наличии»: карточка видна, кнопка неактивна и не добавляет', async () => {
    const { onPick } = setup()
    await screen.findByText('Химичка 3.0')
    fireEvent.click(screen.getByRole('tab', { name: 'Реактивы' }))
    await screen.findByText('Редкий реактив')
    const soldOut = cards()[1]
    expect(soldOut).toHaveTextContent('Нет в наличии')
    const btn = within(soldOut).getByRole('button', { name: /В список/ })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('сообщает о добавлении скринридеру', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    fireEvent.click(within(cards()[0]).getByRole('button', { name: /В список/ }))
    expect(screen.getByRole('status', { name: 'Добавлено в список' })).toHaveTextContent(
      'Химичка 3.0',
    )
  })
})

describe('WholesalePicker: карусель', () => {
  it('в раскладке видны ровно три карточки', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    expect(track()).toHaveAttribute('data-visible', '3')
    expect(within(track()).getAllByRole('listitem')).toHaveLength(4)
  })

  it('«Вперёд» и «Назад» сдвигают ровно на одну карточку', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    const scrollBy = mockGeometry(track(), { scrollLeft: 100, clientWidth: 300, scrollWidth: 500 })
    fireEvent.scroll(track())
    fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }))
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 100, behavior: 'smooth' })
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -100, behavior: 'smooth' })
  })

  it('при prefers-reduced-motion прокручивает без анимации', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }),
    )
    setup()
    await screen.findByText('Химичка 3.0')
    const scrollBy = mockGeometry(track(), { scrollLeft: 0, clientWidth: 300, scrollWidth: 500 })
    fireEvent.scroll(track())
    fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }))
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 100, behavior: 'auto' })
  })

  it('стрелки отключаются на краях', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    const prev = screen.getByRole('button', { name: 'Назад' })
    const next = screen.getByRole('button', { name: 'Вперёд' })

    mockGeometry(track(), { scrollLeft: 0, clientWidth: 300, scrollWidth: 400 })
    fireEvent.scroll(track())
    expect(prev).toBeDisabled()
    expect(next).toBeEnabled()

    mockGeometry(track(), { scrollLeft: 100, clientWidth: 300, scrollWidth: 400 })
    fireEvent.scroll(track())
    expect(prev).toBeEnabled()
    expect(next).toBeDisabled()
  })

  it('когда стрелка отключилась под фокусом, фокус уходит на парную', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    const next = screen.getByRole('button', { name: 'Вперёд' })
    mockGeometry(track(), { scrollLeft: 0, clientWidth: 300, scrollWidth: 400 })
    fireEvent.scroll(track())
    next.focus()
    mockGeometry(track(), { scrollLeft: 100, clientWidth: 300, scrollWidth: 400 })
    fireEvent.scroll(track())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Назад' }))
  })

  it('до трёх товаров стрелок нет', async () => {
    mockByCategory.mockResolvedValue(page(KITS.slice(0, 3)))
    setup()
    await screen.findByText('Химичка 3.0')
    expect(cards()).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Вперёд' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull()
  })

  it.each(['mouse', 'touch', 'pen'])(
    'свайп (%s) уезжает ровно на одну карточку, как бы далеко ни протянули',
    async (pointerType) => {
      setup()
      await screen.findByText('Химичка 3.0')
      const left = mockGeometry(track(), { scrollLeft: 100, clientWidth: 300, scrollWidth: 600 })
      const t = track()

      // влево на 280 px — это почти три карточки, но уезжаем на одну: 100 → 200
      fireEvent.pointerDown(t, { pointerType, button: 0, clientX: 300 })
      fireEvent.pointerMove(t, { pointerType, clientX: 20 })
      expect(t.scrollLeft).toBe(300) // карточки идут за пальцем
      fireEvent.pointerUp(t, { pointerType, clientX: 20 })
      expect(t.scrollLeft).toBe(200)
      expect(left).toHaveBeenLastCalledWith({ left: -100, behavior: 'smooth' })

      // вправо: 200 → 100
      fireEvent.pointerDown(t, { pointerType, button: 0, clientX: 20 })
      fireEvent.pointerMove(t, { pointerType, clientX: 320 })
      fireEvent.pointerUp(t, { pointerType, clientX: 320 })
      expect(t.scrollLeft).toBe(100)
    },
  )

  it('на краях свайп дальше края не уезжает', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    mockGeometry(track(), { scrollLeft: 0, clientWidth: 300, scrollWidth: 400 })
    const t = track()
    fireEvent.pointerDown(t, { pointerType: 'touch', clientX: 20 })
    fireEvent.pointerMove(t, { pointerType: 'touch', clientX: 300 })
    fireEvent.pointerUp(t, { pointerType: 'touch', clientX: 300 })
    expect(t.scrollLeft).toBe(0)
  })

  it('дрожание пальца меньше порога — не жест, ничего не двигается', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    const scrollBy = mockGeometry(track(), { scrollLeft: 100, clientWidth: 300, scrollWidth: 500 })
    fireEvent.pointerDown(track(), { pointerType: 'touch', clientX: 200 })
    fireEvent.pointerMove(track(), { pointerType: 'touch', clientX: 195 })
    fireEvent.pointerUp(track(), { pointerType: 'touch', clientX: 195 })
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('короткое протягивание возвращает карточки на место', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    mockGeometry(track(), { scrollLeft: 100, clientWidth: 300, scrollWidth: 500 })
    fireEvent.pointerDown(track(), { pointerType: 'mouse', button: 0, clientX: 200 })
    fireEvent.pointerMove(track(), { pointerType: 'mouse', clientX: 190 })
    expect(track().scrollLeft).toBe(110)
    fireEvent.pointerUp(track(), { pointerType: 'mouse', clientX: 190 })
    expect(track().scrollLeft).toBe(100)
  })

  it('отмена жеста возвращает карточки на место', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    mockGeometry(track(), { scrollLeft: 100, clientWidth: 300, scrollWidth: 500 })
    fireEvent.pointerDown(track(), { pointerType: 'touch', clientX: 300 })
    fireEvent.pointerMove(track(), { pointerType: 'touch', clientX: 100 })
    fireEvent.pointerCancel(track(), { pointerType: 'touch', clientX: 100 })
    expect(track().scrollLeft).toBe(100)
  })

  it('на время жеста привязка выключена и возвращается, когда доехали', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    mockGeometry(track(), { scrollLeft: 0, clientWidth: 300, scrollWidth: 500 })
    fireEvent.pointerDown(track(), { pointerType: 'touch', clientX: 300 })
    fireEvent.pointerMove(track(), { pointerType: 'touch', clientX: 100 })
    expect(track().style.scrollSnapType).toBe('none')
    fireEvent.pointerUp(track(), { pointerType: 'touch', clientX: 100 })
    expect(track().style.scrollSnapType).toBe('none')
    fireEvent(track(), new Event('scrollend'))
    expect(track().style.scrollSnapType).toBe('')
  })

  it('при prefers-reduced-motion свайп доезжает без анимации и сразу возвращает привязку', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }),
    )
    setup()
    await screen.findByText('Химичка 3.0')
    const scrollBy = mockGeometry(track(), { scrollLeft: 0, clientWidth: 300, scrollWidth: 500 })
    fireEvent.pointerDown(track(), { pointerType: 'touch', clientX: 300 })
    fireEvent.pointerMove(track(), { pointerType: 'touch', clientX: 100 })
    fireEvent.pointerUp(track(), { pointerType: 'touch', clientX: 100 })
    expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'auto' }))
    expect(track().scrollLeft).toBe(100)
    expect(track().style.scrollSnapType).toBe('')
  })

  it('прокрутка и привязка — на CSS scroll-snap, вертикальный жест остаётся за страницей', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    expect(track().className).toContain('snap-x')
    expect(track().className).toContain('snap-mandatory')
    expect(track().className).toContain('touch-pan-y')
    const item = within(track()).getAllByRole('listitem')[0]
    expect(item.className).toContain('snap-start')
    expect(item.className).toContain('[scroll-snap-stop:always]')
  })

  it('клик после перетаскивания не добавляет товар', async () => {
    const { onPick } = setup()
    await screen.findByText('Химичка 3.0')
    mockGeometry(track(), { scrollLeft: 100, clientWidth: 300, scrollWidth: 500 })
    const btn = within(cards()[0]).getByRole('button', { name: /В список/ })
    fireEvent.pointerDown(btn, { pointerType: 'mouse', button: 0, clientX: 200 })
    fireEvent.pointerMove(btn, { pointerType: 'mouse', clientX: 100 })
    fireEvent.pointerUp(btn, { pointerType: 'mouse', clientX: 100 })
    fireEvent.click(btn)
    expect(onPick).not.toHaveBeenCalled()
    // следующий обычный клик работает
    fireEvent.click(btn)
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('обычное нажатие по кнопке карточки без движения — клик', async () => {
    const { onPick } = setup()
    await screen.findByText('Химичка 3.0')
    mockGeometry(track(), { scrollLeft: 0, clientWidth: 300, scrollWidth: 500 })
    const btn = within(cards()[0]).getByRole('button', { name: /В список/ })
    fireEvent.pointerDown(btn, { pointerType: 'touch', clientX: 200 })
    fireEvent.pointerUp(btn, { pointerType: 'touch', clientX: 200 })
    fireEvent.click(btn)
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('регион карусели подписан для скринридеров', async () => {
    setup()
    await screen.findByText('Химичка 3.0')
    expect(screen.getByRole('group', { name: /Наборы/ })).toHaveAttribute(
      'aria-roledescription',
      'карусель',
    )
  })
})
