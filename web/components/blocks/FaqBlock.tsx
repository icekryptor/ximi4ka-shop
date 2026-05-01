import type { FaqBlock as FaqBlockType } from '@ximi4ka-shop/shared'
import { FaqAccordion } from '@/components/ui/FaqAccordion'

interface Props {
  block: FaqBlockType
}

export function FaqBlock({ block }: Props) {
  if (block.items.length === 0) return null

  // Shared FaqItem is { question, answer } — adapt to FaqAccordion's { q, a }
  const items = block.items.map((item) => ({ q: item.question, a: item.answer }))

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: block.items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }

  return (
    <div data-block="faq" className="max-w-[var(--max-lj-narrow)] mx-auto">
      <FaqAccordion items={items} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  )
}
