import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatBar } from './StatBar'

// IntersectionObserver isn't in jsdom; provide a stub that fires immediately
beforeEach(() => {
  // @ts-expect-error - test stub
  global.IntersectionObserver = class {
    constructor(public cb: any) {}
    observe(el: Element) {
      this.cb([{ isIntersecting: true, target: el }])
    }
    unobserve() {}
    disconnect() {}
  }
})

describe('<StatBar>', () => {
  it('renders index, label, and value', () => {
    render(<StatBar index="01" label="реактивов" value={18} fillPercent={100} />)
    expect(screen.getByText(/01\s*\/\s*реактивов/)).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
  })

  it('sets --w CSS custom property to fillPercent', () => {
    const { container } = render(<StatBar index="02" label="x" value={4} fillPercent={20} />)
    const bar = container.querySelector('[data-statbar]') as HTMLElement
    expect(bar.style.getPropertyValue('--w')).toBe('20%')
  })
})
