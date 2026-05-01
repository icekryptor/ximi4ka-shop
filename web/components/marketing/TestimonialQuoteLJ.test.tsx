import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TestimonialQuoteLJ } from './TestimonialQuoteLJ'

describe('<TestimonialQuoteLJ>', () => {
  it('renders body in italic and attribution as mono citation', () => {
    render(
      <TestimonialQuoteLJ
        body="Дети в восторге, всё работает с первого раза."
        author="А. ИВАНОВА"
        meta={['МОСКВА', '2024-03-15', '12 опытов']}
      />
    )
    const body = screen.getByText(/Дети в восторге/)
    expect(body.className).toContain('italic')
    expect(screen.getByText(/А\. ИВАНОВА/)).toBeInTheDocument()
    expect(screen.getByText(/МОСКВА.*2024-03-15.*12 опытов/i)).toBeInTheDocument()
  })

  it('renders brand-purple opening quotation mark', () => {
    const { container } = render(
      <TestimonialQuoteLJ body="x" author="X" meta={[]} />
    )
    const quote = container.querySelector('.lj-quote-mark')
    expect(quote?.textContent).toContain('«')
    expect(quote?.className).toContain('text-[var(--color-lj-brand)]')
  })
})
