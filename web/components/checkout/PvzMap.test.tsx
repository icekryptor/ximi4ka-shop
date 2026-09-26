import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('./CdekWidget', () => ({
  CdekWidget: () => <div data-testid="cdek-widget" />,
}))

import { MAP_INLINE_QUERY, PvzMap } from './PvzMap'

const props = {
  goods: [],
  servicePath: 'https://shop/api/public/cdek/widget?subtotal=1000',
  tariffPvz: 136,
  cityLocation: null,
  selectedPoint: null,
  onChoose: vi.fn(),
}

function stubMatchMedia(matches: boolean) {
  const matchMedia = vi.fn((query: string) => ({ matches, media: query }))
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  })
  return matchMedia
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe('<PvzMap>', () => {
  it('на телефоне карта за кнопкой: виджет и скрипты — только по нажатию', () => {
    const matchMedia = stubMatchMedia(false)
    render(<PvzMap {...props} />)
    expect(matchMedia).toHaveBeenCalledWith(MAP_INLINE_QUERY)
    expect(MAP_INLINE_QUERY).toBe('(min-width: 768px)')
    expect(screen.queryByTestId('cdek-widget')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Показать на карте' }))
    expect(screen.getByTestId('cdek-widget')).toBeInTheDocument()
  })

  it('от 768 px карта сразу', () => {
    stubMatchMedia(true)
    render(<PvzMap {...props} />)
    expect(screen.getByTestId('cdek-widget')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Показать на карте' })).toBeNull()
  })

  it('без matchMedia (старый браузер) — карта сразу', () => {
    render(<PvzMap {...props} />)
    expect(screen.getByTestId('cdek-widget')).toBeInTheDocument()
  })
})
