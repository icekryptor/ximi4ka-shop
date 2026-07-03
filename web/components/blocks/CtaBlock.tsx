import Link from 'next/link'
import type { CtaBlock as CtaBlockType } from '@ximi4ka-shop/shared'

interface Props {
  block: CtaBlockType
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href)
}

const PILL_CLASSES =
  'inline-flex items-center gap-3 px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] border border-[var(--color-lj-ink)] rounded-full bg-[var(--color-lj-ink)] text-[var(--color-lj-bone)] transition-all duration-400 hover:bg-[var(--color-lj-brand-deep)] hover:border-[var(--color-lj-brand-deep)]'

export function CtaBlock({ block }: Props) {
  const external = isExternal(block.buttonHref)

  return (
    <div
      data-block="cta"
      className="max-w-[var(--max-lj-narrow)] mx-auto text-center flex flex-col items-center gap-6 my-12"
    >
      <h3 className="font-lj-display font-[700] text-[clamp(2rem,4vw,3rem)] leading-[1.0] tracking-[-0.04em] text-[var(--color-lj-ink)] max-w-[20ch]">
        {block.heading}
      </h3>
      {block.subtext ? (
        <p className="text-[1.0625rem] leading-[1.5] text-[var(--color-lj-ink)] opacity-78 max-w-[48ch]">
          {block.subtext}
        </p>
      ) : null}
      {external ? (
        <a
          href={block.buttonHref}
          target="_blank"
          rel="noopener noreferrer"
          className={PILL_CLASSES}
        >
          {block.buttonLabel} →
        </a>
      ) : (
        <Link href={block.buttonHref} className={PILL_CLASSES}>
          {block.buttonLabel} →
        </Link>
      )}
    </div>
  )
}
