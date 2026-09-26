import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProductHeroImage } from './ProductHeroImage'
import type { ProductImage } from '@ximi4ka-shop/shared'

const mkImg = (i: number, url: string): ProductImage => ({
  id: `img-${i}`,
  productId: 'p',
  url,
  alt: `Image ${i}`,
  sortOrder: i,
})

describe('<ProductHeroImage>', () => {
  it('renders single image without thumbnails when 1 image', () => {
    const { container } = render(
      <ProductHeroImage images={[mkImg(0, '/a.jpg')]} alt="x" sku="X-30" />,
    )
    expect(container.querySelectorAll('img').length).toBe(1)
    expect(container.querySelector('[data-thumbnails]')).toBeNull()
  })

  it('renders thumbnails when 2+ images', () => {
    const images = [mkImg(0, '/a.jpg'), mkImg(1, '/b.jpg'), mkImg(2, '/c.jpg')]
    const { container } = render(<ProductHeroImage images={images} alt="x" sku="X-30" />)
    const thumbs = container.querySelector('[data-thumbnails]')
    expect(thumbs).not.toBeNull()
    expect(thumbs?.querySelectorAll('button').length).toBe(3)
  })

  it('clicking a thumbnail swaps the main image', () => {
    const images = [mkImg(0, '/a.jpg'), mkImg(1, '/b.jpg')]
    const { container } = render(<ProductHeroImage images={images} alt="x" sku="X-30" />)
    const main = container.querySelector('[data-main-image] img') as HTMLImageElement
    expect(decodeURIComponent(main.src)).toContain('/a.jpg')
    const secondThumb = container.querySelectorAll(
      '[data-thumbnails] button',
    )[1] as HTMLButtonElement
    fireEvent.click(secondThumb)
    const updatedMain = container.querySelector('[data-main-image] img') as HTMLImageElement
    expect(decodeURIComponent(updatedMain.src)).toContain('/b.jpg')
  })

  it('does not render a corner-mark label', () => {
    const { container } = render(
      <ProductHeroImage images={[mkImg(0, '/a.jpg')]} alt="x" sku="X-30" />,
    )
    expect(screen.queryByText(/^arr\./)).not.toBeInTheDocument()
    expect(container.querySelector('[data-main-image] span')).toBeNull()
  })
})

describe('ProductHeroImage empty-state', () => {
  it('renders SpecimenCard at pdp size when images is empty', () => {
    render(<ProductHeroImage images={[]} alt="X" sku="X-30" />)
    expect(screen.getByText('ОБРАЗЕЦ № X-30')).toBeInTheDocument()
    expect(screen.getByText('ФОТО ГОТОВИТСЯ')).toBeInTheDocument()
  })

  it('does not render SpecimenCard when images is populated', () => {
    render(<ProductHeroImage images={[mkImg(0, '/a.png')]} alt="X" sku="X-30" />)
    expect(screen.queryByText('ФОТО ГОТОВИТСЯ')).not.toBeInTheDocument()
  })
})
