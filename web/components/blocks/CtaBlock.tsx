import Link from 'next/link'
import type { CtaBlock as CtaBlockType } from '@ximi4ka-shop/shared'

interface Props {
  block: CtaBlockType
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href)
}

export function CtaBlock({ block }: Props) {
  const external = isExternal(block.buttonHref)

  return (
    <section
      data-block="cta"
      className="my-8 text-center bg-gray-50 rounded-[40px] px-6 py-10"
    >
      <h2 className="text-2xl font-bold mb-2">{block.heading}</h2>
      {block.subtext ? (
        <p className="text-gray-600 mb-6 max-w-2xl mx-auto">{block.subtext}</p>
      ) : null}
      {external ? (
        <a
          href={block.buttonHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-black text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800"
        >
          {block.buttonLabel}
        </a>
      ) : (
        <Link
          href={block.buttonHref}
          className="inline-block bg-black text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800"
        >
          {block.buttonLabel}
        </Link>
      )}
    </section>
  )
}
