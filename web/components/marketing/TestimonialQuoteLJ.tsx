interface Props {
  body: string
  author: string
  meta: string[]
}

export function TestimonialQuoteLJ({ body, author, meta }: Props) {
  const citationLine = ['—', author, ...meta].join(' · ')
  return (
    <article className="border-t border-[var(--color-lj-rule)] pt-6 flex flex-col gap-4">
      <span className="lj-quote-mark font-[var(--font-lj-display)] font-[900] text-5xl leading-none text-[var(--color-lj-brand)]">
        «
      </span>
      <p className="italic text-[1.125rem] leading-[1.5] text-[var(--color-lj-ink)] opacity-90 max-w-[36ch]">
        {body}
      </p>
      <p className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-65 mt-2">
        {citationLine}
      </p>
    </article>
  )
}
