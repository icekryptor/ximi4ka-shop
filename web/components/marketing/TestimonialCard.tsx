import type { PublicTestimonial } from '@/lib/api'
import { GlassCard } from '@/components/ui'

interface Props {
  testimonial: PublicTestimonial
  className?: string
}

export function TestimonialCard({ testimonial, className = '' }: Props) {
  return (
    <GlassCard className={`h-full ${className}`}>
      {testimonial.rating !== undefined && (
        <div
          className="mb-3 flex gap-0.5 text-[var(--color-brand)]"
          aria-label={`Оценка ${testimonial.rating} из 5`}
        >
          {Array.from({ length: 5 }).map((_, idx) => (
            <span key={idx} aria-hidden="true">
              {idx < testimonial.rating! ? '★' : '☆'}
            </span>
          ))}
        </div>
      )}
      <blockquote className="mb-4 italic text-[length:var(--text-body)] text-[var(--color-brand-text)] leading-[var(--leading-body)]">
        «{testimonial.quote}»
      </blockquote>
      <footer className="text-[length:var(--text-small)] font-medium text-[var(--color-brand-text-secondary)]">
        {testimonial.author}, {testimonial.location}
      </footer>
    </GlassCard>
  )
}
