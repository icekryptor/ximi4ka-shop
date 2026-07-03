import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { BlogPost } from '@ximi4ka-shop/shared'
import { ApiError, getBlogPostBySlug, listBlogPosts } from '@/lib/api'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { JsonLd } from '@/components/seo/JsonLd'
import { LabSection } from '@/components/ui/LabSection'
import { NotebookHeader } from '@/components/ui/NotebookHeader'
import { PreFooterCta } from '@/components/marketing'
import { buildMetadata } from '@/lib/metadata'
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/jsonLd'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  formatDateRu,
  isLocale,
  pickField,
  type Locale,
} from '@/lib/i18n'

export const revalidate = 60
// New posts publish between builds — render them on demand instead of 404ing.
export const dynamicParams = true

export async function generateStaticParams() {
  try {
    const res = await listBlogPosts({ limit: 100 })
    return SUPPORTED_LOCALES.flatMap((locale) =>
      res.data.map((p) => ({ locale, slug: p.slug })),
    )
  } catch {
    return []
  }
}

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

function pathForLocale(locale: Locale, slug: string): string {
  return locale === DEFAULT_LOCALE
    ? `/blog/${slug}`
    : `/${locale}/blog/${slug}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  try {
    const post = await getBlogPostBySlug(slug)
    const title = pickField<string>(post, 'title', locale) ?? post.title
    const excerpt = pickField<string>(post, 'excerpt', locale)
    const metaTitle = pickField<string>(post, 'metaTitle', locale)
    const metaDescription = pickField<string>(post, 'metaDescription', locale)
    const alternatesByLocale = Object.fromEntries(
      SUPPORTED_LOCALES.map((loc) => [loc, pathForLocale(loc, slug)]),
    ) as Record<Locale, string>
    return buildMetadata({
      title,
      description: excerpt,
      metaTitle,
      metaDescription,
      ogImage: post.ogImage ?? post.coverImageUrl,
      canonicalUrl: post.canonicalUrl,
      noindex: post.noindex,
      pathname: pathForLocale(locale, slug),
      type: 'article',
      locale,
      alternatesByLocale,
    })
  } catch {
    return { title: 'Статья — Ximi4ka' }
  }
}

async function fetchPost(slug: string): Promise<BlogPost> {
  try {
    return await getBlogPostBySlug(slug)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound()
    }
    throw err
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { locale: rawLocale, slug } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale

  const post = await fetchPost(slug)
  const title = pickField<string>(post, 'title', locale) ?? post.title
  const excerpt = pickField<string>(post, 'excerpt', locale) ?? post.excerpt
  const blocks = (pickField<unknown[]>(post, 'blocks', locale) ??
    post.blocks ??
    []) as unknown[]

  const dateIso = post.publishedAt ?? post.createdAt
  const homePath = locale === DEFAULT_LOCALE ? '/' : `/${locale}`
  const blogPath = locale === DEFAULT_LOCALE ? '/blog' : `/${locale}/blog`

  return (
    <>
      <JsonLd data={articleJsonLd(post)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', url: '/' },
          { name: 'Блог', url: '/blog' },
          { name: title, url: pathForLocale(locale, post.slug) },
        ])}
      />

      {/* Mono breadcrumb trail */}
      <nav
        aria-label="breadcrumbs"
        className="max-w-[var(--max-lj-content)] mx-auto px-6 pt-6 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-70"
      >
        <Link href={homePath} className="hover:opacity-100">
          Главная
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <Link href={blogPath} className="hover:opacity-100">
          Блог
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="opacity-100 text-[var(--color-lj-brand-deep)]">
          {title}
        </span>
      </nav>

      {/* B. Статья (LAB CREAM) — journal entry header */}
      <LabSection variant="cream" className="px-6 pt-12 pb-10">
        <NotebookHeader section="B" label="Блог" page={1} total={2} />
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-5 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
            B.1 / {post.rubric ?? 'Статья'}
          </p>
          <h1 className="font-lj-display font-[900] text-[clamp(2.25rem,5vw,4.25rem)] leading-[0.96] tracking-[-0.045em] mb-5 max-w-[24ch]">
            {title}
          </h1>
          <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-60 mb-6">
            <time dateTime={dateIso}>{formatDateRu(dateIso)}</time>
          </p>
          {excerpt && (
            <p className="text-xl leading-[1.45] opacity-78 max-w-[48ch]">
              {excerpt}
            </p>
          )}
        </div>
      </LabSection>

      {/* Cover + body */}
      <LabSection variant="cream" className="px-6 pb-16">
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          {post.coverImageUrl && (
            <div className="relative aspect-[16/9] max-w-4xl mb-12 bg-[var(--color-lj-cream-shade)] border border-[var(--color-lj-rule)] overflow-hidden">
              <Image
                src={post.coverImageUrl}
                alt={title}
                fill
                priority
                sizes="(max-width: 768px) 100vw, 896px"
                className="object-cover"
              />
            </div>
          )}
          {blocks.length > 0 ? (
            <div className="max-w-3xl">
              <BlockRenderer blocks={blocks} />
            </div>
          ) : (
            <p className="max-w-3xl opacity-60 font-lj-mono uppercase tracking-[0.06em]">
              Статья пока пуста
            </p>
          )}
        </div>
      </LabSection>

      {/* Pre-footer CTA */}
      <PreFooterCta
        title="Читайте другие записи журнала"
        cta={{ label: 'Все статьи', href: '/blog' }}
      />
    </>
  )
}
