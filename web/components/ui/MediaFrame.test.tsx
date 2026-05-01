import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MediaFrame } from './MediaFrame'

describe('<MediaFrame>', () => {
  it('renders children inside cream-shade backdrop with ink border', () => {
    const { container } = render(<MediaFrame cornerMark="arr. 01"><div>x</div></MediaFrame>)
    const frame = container.querySelector('[data-frame]') as HTMLElement
    expect(frame.className).toContain('bg-[var(--color-lj-cream-shade)]')
    expect(frame.className).toContain('border-[var(--color-lj-rule)]')
  })

  it('renders the corner mark', () => {
    render(<MediaFrame cornerMark="arr. P-02"><div>x</div></MediaFrame>)
    expect(screen.getByText('arr. P-02')).toBeInTheDocument()
  })

  it('renders caption underneath when provided', () => {
    render(<MediaFrame cornerMark="x" caption="Подпись"><div>x</div></MediaFrame>)
    expect(screen.getByText(/Подпись/)).toBeInTheDocument()
  })

  it('omits caption block when not provided', () => {
    const { container } = render(<MediaFrame cornerMark="x"><div>x</div></MediaFrame>)
    expect(container.querySelector('[data-caption]')).toBeNull()
  })

  it('respects aspect ratio prop', () => {
    const { container } = render(<MediaFrame cornerMark="x" aspectRatio="16/9"><div>x</div></MediaFrame>)
    const frame = container.querySelector('[data-frame]') as HTMLElement
    expect(frame.style.aspectRatio).toBe('16 / 9')
  })
})
