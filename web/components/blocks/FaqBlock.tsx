import type { FaqBlock as FaqBlockType } from '@ximi4ka-shop/shared'

interface Props {
  block: FaqBlockType
}

export function FaqBlock({ block }: Props) {
  if (block.items.length === 0) return null

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
    <section data-block="faq" className="my-8">
      {block.items.map((item, i) => (
        <details
          key={i}
          className="border-b border-gray-200 py-4 group"
        >
          <summary className="cursor-pointer font-semibold list-none flex justify-between items-center">
            <span>{item.question}</span>
            <span aria-hidden className="text-gray-400 group-open:rotate-45 transition-transform">
              +
            </span>
          </summary>
          <p className="mt-3 text-gray-700 whitespace-pre-line">{item.answer}</p>
        </details>
      ))}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </section>
  )
}
