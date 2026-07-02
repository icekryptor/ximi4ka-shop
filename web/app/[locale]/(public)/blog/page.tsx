import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { BlogPost } from '@ximi4ka-shop/shared'
import { listBlogPosts } from '@/lib/api'
import { BlogPostCard } from '@/components/BlogPostCard'
import { LabSection } from '@/components/ui/LabSection'
import { NotebookHeader } from '@/components/ui/NotebookHeader'
import { PaginationLJ } from '@/components/ui/PaginationLJ'
import { PreFooterCta } from '@/components/marketing'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildMetadata } from '@/lib/metadata'
import { breadcrumbJsonLd } from '@/lib/jsonLd'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  type Locale,
} from '@/lib/i18n'

export const revalidate = 60

const PAGE_SIZE = 12

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }))
}

interface Props {
  params: Promise<{ locale: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pathForLocale(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? '/blog' : `/${locale}/blog`
}

export async function generateMetadata({
  params,
}: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const alternatesByLocale = Object.fromEntries(
    SUPPORTED_LOCALES.map((loc) => [loc, pathForLocale(loc)]),
  ) as Record<Locale, string>
  return buildMetadata({
    title: 'Блог о химии — Ximi4ka',
    metaDescription:
      'Статьи о химии, опытах и наборах Ximi4ka: как устроены реакции и как безопасно повторить их дома.',
    pathname: pathForLocale(locale),
    type: 'website',
    locale,
    alternatesByLocale,
  })
}

async function fetchPosts(
  page: number,
): Promise<{ posts: BlogPost[]; total: number }> {
  try {
    const res = await listBlogPosts({ page, limit: PAGE_SIZE })
    return { posts: res.data, total: res.pagination.total }
  } catch {
    // Degrade to an empty journal rather than a 500 — mirrors how the
    // category listing behaves when the API is unreachable.
    return { posts: [], total: 0 }
  }
}

export default async function BlogListPage({ params, searchParams }: Props) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const sp = (await searchParams) ?? {}
  const pageRaw = sp.page
  const page = Math.max(
    1,
    parseInt(typeof pageRaw === 'string' ? pageRaw : '1', 10) || 1,
  )

  const { posts, total } = await fetchPosts(page)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const homePath = locale === DEFAULT_LOCALE ? '/' : `/${locale}`

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', url: '/' },
          { name: 'Блог', url: '/blog' },
        ])}
      />

      {/* Mono breadcrumb trail */}
      <nav
        aria-label="breadcrumbs"
        className="max-w-[var(--max-lj-content)] mx-auto px-6 pt-6 font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-70"
      >
        <Link href={homePath} className="hover:opacity-100">
          Главная
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="opacity-100 text-[var(--color-lj-brand-deep)]">
          Блог
        </span>
      </nav>

      {/* B. Блог (LAB CREAM) — v3 LJ hero */}
      <LabSection variant="cream" className="px-6 pt-12 pb-16">
        <NotebookHeader section="B" label="Блог" page={1} total={2} />
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          <p className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-5 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
            B.0 / Полевые записи
          </p>
          <h1 className="font-[var(--font-lj-display)] font-[900] text-[clamp(2.5rem,6vw,5rem)] leading-[0.92] tracking-[-0.045em] mb-6">
            <em className="italic text-[var(--color-lj-brand)] font-[900]">
              Блог
            </em>{' '}
            о химии
          </h1>
          <p className="text-xl leading-[1.45] opacity-78 max-w-[48ch]">
            Записи из лаборатории: как устроены реакции, что происходит в
            наборах и как безопасно повторить опыты дома.
          </p>
        </div>
      </LabSection>

      {/* Post grid */}
      <LabSection variant="cream" className="px-6 py-16">
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          {posts.length === 0 ? (
            <p className="text-center opacity-60 py-32 font-[var(--font-lj-mono)] uppercase tracking-[0.06em]">
              Пока нет статей
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {posts.map((post) => (
                <BlogPostCard key={post.id} post={post} />
              ))}
            </div>
          )}
          {/* Pagination — PaginationLJ renders null when totalPages <= 1 */}
          <PaginationLJ
            currentPage={page}
            totalPages={totalPages}
            totalResults={total}
            resultsPerPage={PAGE_SIZE}
            basePath={pathForLocale(locale)}
          />
        </div>
      </LabSection>

      {/* Pre-footer CTA */}
      <PreFooterCta
        title="Проверьте теорию на практике"
        lead="В каталоге собраны наборы для разных возрастов и научных направлений."
        cta={{ label: 'Открыть каталог', href: '/categories' }}
      />
    </>
  )
}
