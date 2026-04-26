import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PublicTestimonial } from '@/lib/api'
import { TestimonialCard } from './TestimonialCard'

const base: PublicTestimonial = {
  quote: 'Сын в восторге от набора с кристаллами.',
  author: 'Анна',
  location: 'Москва',
  rating: 5,
}

describe('TestimonialCard', () => {
  it('renders the quote wrapped in « » quote marks', () => {
    render(<TestimonialCard testimonial={base} />)
    expect(
      screen.getByText('«Сын в восторге от набора с кристаллами.»'),
    ).toBeInTheDocument()
  })

  it('renders the author and location', () => {
    render(<TestimonialCard testimonial={base} />)
    expect(screen.getByText('Анна, Москва')).toBeInTheDocument()
  })

  it('renders rating stars when rating is provided', () => {
    render(<TestimonialCard testimonial={base} />)
    expect(screen.getByLabelText('Оценка 5 из 5')).toBeInTheDocument()
  })

  it('renders no stars when rating is omitted', () => {
    render(
      <TestimonialCard
        testimonial={{ quote: 'q', author: 'a', location: 'l' }}
      />,
    )
    expect(screen.queryByLabelText(/Оценка/)).not.toBeInTheDocument()
  })

  it('shows the quote inside a <blockquote>', () => {
    const { container } = render(<TestimonialCard testimonial={base} />)
    expect(container.querySelector('blockquote')).not.toBeNull()
  })
})
