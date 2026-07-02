import Image from 'next/image'
import Link from 'next/link'
import type { BlogPost } from '@ximi4ka-shop/shared'
import { DashedRectMark } from '@/components/ui/illustrations/DashedRectMark'
import { formatDateRu } from '@/lib/i18n'

interface Props {
  post: BlogPost
}

/**
 * Blog listing card in the v3 «Лабораторный журнал» language: cover photo
 * (or a SpecimenCard-style dashed placeholder when the editor hasn't
 * uploaded one), mono rubric + date line, display-font title, body excerpt.
 *
 * Links are locale-unprefixed on purpose — the middleware rewrites RU URLs
 * internally, matching how ProductCard / Header links behave.
 */
export function BlogPostCard({ post }: Props) {
  const href = `/blog/${post.slug}`
  const dateIso = post.publishedAt ?? post.createdAt
  const dateLabel = formatDateRu(dateIso)

  return (
    <article className="group/bcard relative bg-transparent">
      <Link href={href} className="block" tabIndex={-1} aria-hidden="true">
        {post.coverImageUrl ? (
          <div className="relative aspect-[4/3] bg-[var(--color-lj-cream-shade)] border border-[var(--color-lj-rule)] overflow-hidden transition-[border-color] duration-500 group-hover/bcard:border-[var(--color-lj-ink)]">
            <Image
              src={post.coverImageUrl}
              alt={post.title}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover/bcard:scale-[1.04]"
            />
          </div>
        ) : (
          <div
            className="relative aspect-[4/3] bg-[var(--color-lj-cream-shade)] border border-[var(--color-lj-rule)] overflow-hidden"
            role="presentation"
          >
            <span className="absolute top-3.5 left-3.5 font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] tracking-[0.08em] uppercase text-[var(--color-lj-ink)] opacity-55">
              ЗАПИСЬ / {post.rubric ?? 'БЛОГ'}
            </span>
            <div className="absolute inset-[18%] text-[var(--color-lj-ink)] opacity-30">
              <DashedRectMark ratio="1-1" className="w-full h-full" />
            </div>
            <span className="absolute bottom-3.5 left-1/2 -translate-x-1/2 font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-sm)] tracking-[0.04em] uppercase text-[var(--color-lj-ink)] opacity-70 whitespace-nowrap">
              ОБЛОЖКА ГОТОВИТСЯ
            </span>
          </div>
        )}
      </Link>

      <div className="pt-5">
        <p className="flex items-center gap-3 mb-3 font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)]">
          {post.rubric && (
            <>
              <span className="opacity-70">{post.rubric}</span>
              <span aria-hidden="true" className="opacity-40">
                /
              </span>
            </>
          )}
          <time dateTime={dateIso} className="opacity-55">
            {dateLabel}
          </time>
        </p>

        <h3 className="font-[var(--font-lj-display)] font-[700] text-[clamp(1.375rem,1.9vw,1.75rem)] leading-[1.05] tracking-[-0.035em] mb-3">
          <Link
            href={href}
            className="transition-colors group-hover/bcard:text-[var(--color-lj-brand-deep)]"
          >
            {post.title}
          </Link>
        </h3>

        {post.excerpt && (
          <p className="text-[0.9375rem] leading-[1.45] text-[var(--color-lj-ink)] opacity-72 max-w-[38ch]">
            {post.excerpt}
          </p>
        )}
      </div>
    </article>
  )
}
