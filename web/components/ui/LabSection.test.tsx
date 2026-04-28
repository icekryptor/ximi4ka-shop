import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LabSection } from './LabSection'

describe('<LabSection>', () => {
  it('renders cream variant with ink text by default', () => {
    render(<LabSection variant="cream" data-testid="lab-section">hello</LabSection>)
    const el = screen.getByTestId('lab-section')
    expect(el.className).toContain('bg-[var(--color-lj-cream)]')
    expect(el.className).toContain('text-[var(--color-lj-ink)]')
  })

  it('renders ink variant with bone text', () => {
    render(<LabSection variant="ink" data-testid="lab-section">hello</LabSection>)
    const el = screen.getByTestId('lab-section')
    expect(el.className).toContain('bg-[var(--color-lj-ink)]')
    expect(el.className).toContain('text-[var(--color-lj-bone)]')
  })

  it('renders as a <section> element (load-bearing semantics)', () => {
    render(<LabSection variant="cream" data-testid="lab-section">x</LabSection>)
    expect(screen.getByTestId('lab-section').tagName).toBe('SECTION')
  })

  it('forwards arbitrary attributes (id + aria-*) to the underlying element', () => {
    render(
      <LabSection variant="cream" id="manifesto" aria-labelledby="manifesto-h">
        x
      </LabSection>,
    )
    const el = document.querySelector('#manifesto')
    expect(el).not.toBeNull()
    expect(el?.getAttribute('aria-labelledby')).toBe('manifesto-h')
  })
})
