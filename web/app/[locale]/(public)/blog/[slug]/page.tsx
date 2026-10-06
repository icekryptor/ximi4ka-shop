import Image from 'next/image'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { BlogPost } from '@ximi4ka-shop/shared'
import { ApiError, getBlogPostBySlug, listBlogPosts } from '@/lib/api'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { JsonLd } from '@/components/seo/JsonLd'
import { LabSection } from '@/components/ui/LabSection'
import { PreFooterCta } from '@/components/marketing'
import { BlogAuthorBox } from '@/components/BlogAuthorBox'
import { BlogToc } from '@/components/BlogToc'
import { RelatedPosts } from '@/components/RelatedPosts'
import { buildMetadata } from '@/lib/metadata'
import { articleJsonLd, breadcrumbJsonLd, type BreadcrumbItem } from '@/lib/jsonLd'
import { addHeadingAnchors } from '@/lib/articleToc'
import { pickRelatedPosts } from '@/lib/relatedPosts'
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
    return SUPPORTED_LOCALES.flatMap((locale) => res.data.map((p) => ({ locale, slug: p.slug })))
  } catch {
    return []
  }
}

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

function pathForLocale(locale: Locale, slug: string): string {
  return locale === DEFAULT_LOCALE ? `/blog/${slug}` : `/${locale}/blog/${slug}`
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
      brandSuffix: true,
      locale,
      alternatesByLocale,
      rssPath: '/blog/rss.xml',
    })
  } catch {
    return { title: 'Статья — Химичка' }
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

// Кандидаты для «Похожих статей». Сбой списка не должен ронять статью.
async function fetchRelatedPosts(post: BlogPost): Promise<BlogPost[]> {
  try {
    const res = await listBlogPosts({ limit: 100 })
    return pickRelatedPosts(post, res?.data ?? [])
  } catch {
    return []
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { locale: rawLocale, slug } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale

  const post = await fetchPost(slug)
  const title = pickField<string>(post, 'title', locale) ?? post.title
  const excerpt = pickField<string>(post, 'excerpt', locale) ?? post.excerpt
  const rawBlocks = (pickField<unknown[]>(post, 'blocks', locale) ?? post.blocks ?? []) as unknown[]
  // Якоря на h2/h3 и оглавление строятся по тому же набору блоков, что и показан.
  const { blocks, toc } = addHeadingAnchors(rawBlocks)
  const relatedPosts = await fetchRelatedPosts(post)

  const dateIso = post.publishedAt ?? post.createdAt
  // «Обновлено» — только если правка случилась в другой день, чем публикация:
  // сама публикация тоже обновляет updatedAt, и дата дублировалась бы.
  const showUpdated =
    new Date(post.updatedAt) > new Date(dateIso) &&
    formatDateRu(post.updatedAt) !== formatDateRu(dateIso)
  const homePath = locale === DEFAULT_LOCALE ? '/' : `/${locale}`
  const blogPath = locale === DEFAULT_LOCALE ? '/blog' : `/${locale}/blog`
  const crumbs: BreadcrumbItem[] = [
    { name: 'Главная', href: homePath },
    { name: 'Блог', href: blogPath },
    { name: title, href: pathForLocale(locale, post.slug) },
  ]

  return (
    <>
      <JsonLd
        data={articleJsonLd(
          {
            ...post,
            description: post.excerpt ?? post.metaDescription,
            image: post.coverImageUrl ?? post.ogImage,
            url: `/blog/${post.slug}`,
          },
          'BlogPosting',
        )}
      />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />

      {/* Mono breadcrumb trail */}
      <Breadcrumbs items={crumbs} />

      {/* B. Статья (LAB CREAM) — journal entry header */}
      <LabSection variant="cream" className="px-6 pt-12 pb-10">
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-5 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
            {post.rubric ?? 'Статья'}
          </p>
          <h1 className="font-lj-display font-[900] text-[clamp(2.25rem,5vw,4.25rem)] leading-[0.96] tracking-[-0.045em] mb-5 max-w-[24ch]">
            {title}
          </h1>
          <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-60 mb-6">
            <time dateTime={dateIso}>{formatDateRu(dateIso)}</time>
            {showUpdated && (
              <>
                <span className="mx-3 opacity-60" aria-hidden="true">
                  /
                </span>
                <span>
                  Обновлено <time dateTime={post.updatedAt}>{formatDateRu(post.updatedAt)}</time>
                </span>
              </>
            )}
          </p>
          {excerpt && <p className="text-xl leading-[1.45] opacity-78 max-w-[48ch]">{excerpt}</p>}
        </div>
      </LabSection>

      {/* Cover + body */}
      <LabSection variant="cream" className="px-6 pb-16">
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          {/* 9 из 12 колонок на lg+, на узких экранах — вся ширина. Абзацы блоков
              ограничены 60ch в ParagraphBlock; здесь это снимается, иначе
              колонка шире, а текст остаётся узким. */}
          <div
            data-blog-article-column
            className="w-full lg:w-9/12 [&_[data-block=paragraph]]:max-w-none [&_h2]:scroll-mt-28 [&_h3]:scroll-mt-28"
          >
            {post.coverImageUrl && (
              <div className="relative aspect-[16/9] mb-12 bg-[var(--color-lj-cream-shade)] border border-[var(--color-lj-rule)] overflow-hidden">
                <Image
                  src={post.coverImageUrl}
                  alt={title}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 1200px"
                  className="object-cover"
                />
              </div>
            )}
            <BlogToc items={toc} />
            {blocks.length > 0 ? (
              <BlockRenderer blocks={blocks} />
            ) : (
              <p className="opacity-60 font-lj-mono uppercase tracking-[0.06em]">
                Статья пока пуста
              </p>
            )}
            <BlogAuthorBox post={post} />
          </div>
        </div>
      </LabSection>

      <RelatedPosts posts={relatedPosts} />

      {/* Pre-footer CTA */}
      <PreFooterCta
        title="Читайте другие записи журнала"
        cta={{ label: 'Все статьи', href: '/blog' }}
      />
    </>
  )
}
