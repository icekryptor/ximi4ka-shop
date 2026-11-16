import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CashbackRow } from './cart/CashbackRow'
import { CoinIcon } from './CoinIcon'

describe('CoinIcon', () => {
  it('рисует монету из public/img/brand как декоративную картинку', () => {
    const { container } = render(<CoinIcon />)
    const img = container.querySelector('img[data-coin-icon]')
    expect(img).toHaveAttribute('src', '/img/brand/ximicoin.svg')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('aria-hidden', 'true')
  })

  it('size — высота, ширина по пропорции наклонённой монеты 188×166', () => {
    const { container } = render(<CoinIcon size={22} />)
    const img = container.querySelector('img[data-coin-icon]') as HTMLImageElement
    expect(img.style.height).toBe('22px')
    expect(img.style.width).toBe('25px')
  })

  it('в строке кэшбека монета не приглушена вместе с текстом', () => {
    const { container } = render(<CashbackRow coins={50} signedIn />)
    const img = container.querySelector('img[data-coin-icon]')
    expect(img?.closest('.opacity-70')).toBeNull()
  })
})
