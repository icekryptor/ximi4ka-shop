import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { RuleAsym } from './RuleAsym'

describe('<RuleAsym>', () => {
  it('renders 38% width left-aligned by default', () => {
    const { container } = render(<RuleAsym />)
    const el = container.firstChild as HTMLElement
    expect(el.style.width).toBe('38%')
    expect(el.style.left).toBe('0px')
  })

  it('renders 22% width right-aligned when align=right', () => {
    const { container } = render(<RuleAsym align="right" />)
    const el = container.firstChild as HTMLElement
    expect(el.style.width).toBe('22%')
    expect(el.style.right).toBe('0px')
  })

  it('uses ink-on-rule color when surface=ink', () => {
    const { container } = render(<RuleAsym surface="ink" />)
    const el = container.firstChild as HTMLElement
    expect(el.style.background).toContain('var(--color-lj-rule-on-ink)')
  })

  it('marks itself as decorative via aria-hidden', () => {
    const { container } = render(<RuleAsym />)
    expect((container.firstChild as HTMLElement).getAttribute('aria-hidden')).toBe('true')
  })
})
