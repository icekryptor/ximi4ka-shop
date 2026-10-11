import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Product } from '@ximi4ka-shop/shared'
import { GiftBanner } from './GiftBanner'
import { loadGiftChoice, saveGiftChoice } from '@/lib/gift'

const getPublishedProduct = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ getPublishedProduct }))

function product(slug: string, name: string, overrides: Partial<Product> = {}): Product {
  return {
    id: `id-${slug}`,
    slug,
    name,
    stockStatus: 'in_stock',
    isPublished: true,
    priceRub: 199,
    images: [],
    ...overrides,
  } as Product
}

const CATALOG: Record<string, Product> = {
  'azotnaya-kislota-10': product('azotnaya-kislota-10', 'Азотная кислота'),
  'solyanaya-kislota': product('solyanaya-kislota', 'Соляная кислота'),
  'iodat-kaliya': product('iodat-kaliya', 'Йодат калия'),
}

beforeEach(() => {
  window.localStorage.clear()
  getPublishedProduct.mockReset()
  getPublishedProduct.mockImplementation(async (slug: string) => {
    const found = CATALOG[slug]
    if (!found) throw new Error('not found')
    return found
  })
})

afterEach(() => {
  cleanup()
})

describe('GiftBanner', () => {
  it('в пустой корзине не показывается', () => {
    const { container } = render(<GiftBanner totalRub={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ниже порога подсказывает, сколько добавить, и не грузит реактивы', () => {
    render(<GiftBanner totalRub={2400} />)

    expect(screen.getByTestId('gift-banner')).toHaveTextContent(/подарок/i)
    expect(screen.getByTestId('gift-banner')).toHaveTextContent(/600\s*₽/)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(getPublishedProduct).not.toHaveBeenCalled()
  })

  it('от порога: «Вам подарок!» и три реактива на выбор', async () => {
    render(<GiftBanner totalRub={3000} />)

    expect(screen.getByText('Вам подарок!')).toBeInTheDocument()
    expect(await screen.findByRole('radio', { name: /Азотная кислота/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Соляная кислота/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Йодат калия/ })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('выбор сохраняется и переключается', async () => {
    render(<GiftBanner totalRub={3500} />)

    fireEvent.click(await screen.findByRole('radio', { name: /Йодат калия/ }))
    expect(loadGiftChoice()).toEqual({
      productId: 'id-iodat-kaliya',
      slug: 'iodat-kaliya',
      name: 'Йодат калия',
    })
    expect(screen.getByRole('radio', { name: /Йодат калия/ })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: /Соляная кислота/ }))
    expect(loadGiftChoice()?.slug).toBe('solyanaya-kislota')
    expect(screen.getByRole('radio', { name: /Йодат калия/ })).not.toBeChecked()
  })

  it('не предлагает закончившийся и неопубликованный реактив', async () => {
    CATALOG['solyanaya-kislota'] = product('solyanaya-kislota', 'Соляная кислота', {
      stockStatus: 'out_of_stock',
    })
    CATALOG['iodat-kaliya'] = product('iodat-kaliya', 'Йодат калия', { isPublished: false })
    try {
      render(<GiftBanner totalRub={3000} />)

      expect(await screen.findByRole('radio', { name: /Азотная кислота/ })).toBeInTheDocument()
      expect(screen.getAllByRole('radio')).toHaveLength(1)
    } finally {
      CATALOG['solyanaya-kislota'] = product('solyanaya-kislota', 'Соляная кислота')
      CATALOG['iodat-kaliya'] = product('iodat-kaliya', 'Йодат калия')
    }
  })

  it('сбой загрузки одного реактива не прячет остальные', async () => {
    getPublishedProduct.mockImplementation(async (slug: string) => {
      if (slug === 'solyanaya-kislota') throw new Error('network')
      return CATALOG[slug]
    })

    render(<GiftBanner totalRub={3000} />)

    expect(await screen.findByRole('radio', { name: /Азотная кислота/ })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  it('снимает сохранённый выбор, если реактива больше нет среди доступных', async () => {
    saveGiftChoice({ productId: 'id-gone', slug: 'gone', name: 'Исчезнувший' })

    render(<GiftBanner totalRub={3000} />)

    await screen.findByRole('radio', { name: /Азотная кислота/ })
    await waitFor(() => expect(loadGiftChoice()).toBeNull())
  })

  it('оставляет сохранённый выбор, пока он есть среди доступных', async () => {
    const saved = {
      productId: 'id-solyanaya-kislota',
      slug: 'solyanaya-kislota',
      name: 'Соляная кислота',
    }
    saveGiftChoice(saved)

    render(<GiftBanner totalRub={3000} />)

    expect(await screen.findByRole('radio', { name: /Соляная кислота/ })).toBeChecked()
    expect(loadGiftChoice()).toEqual(saved)
  })

  it('две плашки на экране (страница и drawer) не сбивают друг другу выбор', async () => {
    saveGiftChoice({ productId: 'id-iodat-kaliya', slug: 'iodat-kaliya', name: 'Йодат калия' })

    render(
      <>
        <GiftBanner totalRub={3000} />
        <GiftBanner totalRub={3000} />
      </>,
    )

    await waitFor(() =>
      expect(screen.getAllByRole('radio', { name: /Йодат калия/ })).toHaveLength(2),
    )
    for (const radio of screen.getAllByRole('radio', { name: /Йодат калия/ })) {
      expect(radio).toBeChecked()
    }
  })

  it('снимает выбор, когда сумма упала ниже порога', async () => {
    saveGiftChoice({ productId: 'id-iodat-kaliya', slug: 'iodat-kaliya', name: 'Йодат калия' })

    const { rerender } = render(<GiftBanner totalRub={3000} />)
    await screen.findByRole('radio', { name: /Йодат калия/ })

    act(() => rerender(<GiftBanner totalRub={2500} />))

    await waitFor(() => expect(loadGiftChoice()).toBeNull())
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })
})
