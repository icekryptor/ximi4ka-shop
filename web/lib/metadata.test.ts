import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildMetadata } from './metadata'

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL

describe('buildMetadata', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL
  })
  afterEach(() => {
    if (ORIGINAL_SITE_URL != null) process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL
  })

  it('uses metaTitle when provided and falls back to title otherwise', () => {
    const withMeta = buildMetadata({
      title: 'Fallback',
      metaTitle: 'Meta',
      pathname: '/x',
    })
    expect(withMeta.title).toBe('Meta')

    const withoutMeta = buildMetadata({
      title: 'Fallback',
      pathname: '/x',
    })
    expect(withoutMeta.title).toBe('Fallback')
  })

  it('uses metaDescription then description, else undefined', () => {
    expect(
      buildMetadata({ title: 'T', metaDescription: 'M', description: 'D', pathname: '/' })
        .description,
    ).toBe('M')
    expect(buildMetadata({ title: 'T', description: 'D', pathname: '/' }).description).toBe('D')
    expect(buildMetadata({ title: 'T', pathname: '/' }).description).toBeUndefined()
  })

  it('builds absolute canonical from pathname + default site URL', () => {
    const meta = buildMetadata({ title: 'T', pathname: '/product/foo' })
    expect(meta.alternates?.canonical).toBe('https://new.ximi4ka.ru/product/foo')
  })

  it('respects explicit canonicalUrl', () => {
    const meta = buildMetadata({
      title: 'T',
      canonicalUrl: 'https://example.com/custom',
      pathname: '/product/foo',
    })
    expect(meta.alternates?.canonical).toBe('https://example.com/custom')
  })

  it('uses NEXT_PUBLIC_SITE_URL env var for canonical when set', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://preview.example.com'
    const meta = buildMetadata({ title: 'T', pathname: '/a' })
    expect(meta.alternates?.canonical).toBe('https://preview.example.com/a')
  })

  it('sets robots noindex + nofollow when noindex is true', () => {
    const meta = buildMetadata({ title: 'T', pathname: '/cart', noindex: true })
    expect(meta.robots).toEqual({ index: false, follow: false })
  })

  it('leaves robots undefined when noindex is false', () => {
    expect(buildMetadata({ title: 'T', pathname: '/' }).robots).toBeUndefined()
  })

  it('builds OG with siteName, ru_RU locale, canonical url and image', () => {
    const meta = buildMetadata({
      title: 'Hello',
      description: 'Desc',
      ogImage: 'https://cdn.example.com/og.jpg',
      pathname: '/foo',
    })
    expect(meta.openGraph).toMatchObject({
      title: 'Hello',
      description: 'Desc',
      url: 'https://new.ximi4ka.ru/foo',
      siteName: 'Химичка',
      locale: 'ru_RU',
    })
    expect((meta.openGraph as { type?: string } | undefined)?.type).toBe('website')
    expect(meta.openGraph?.images).toEqual([{ url: 'https://cdn.example.com/og.jpg' }])
  })

  it('omits the OG image when none provided (no og-default.png on the site)', () => {
    const meta = buildMetadata({ title: 'T', pathname: '/' })
    expect(meta.openGraph?.images).toBeUndefined()
  })

  it('makes a root-relative OG image absolute', () => {
    const meta = buildMetadata({ title: 'T', pathname: '/', ogImage: '/uploads/kit.jpg' })
    expect(meta.openGraph?.images).toEqual([{ url: 'https://new.ximi4ka.ru/uploads/kit.jpg' }])
  })

  it('does not emit an RSS alternate unless rssPath is given', () => {
    expect(buildMetadata({ title: 'T', pathname: '/' }).alternates?.types).toBeUndefined()
  })

  it('emits <link rel="alternate" type="application/rss+xml"> when rssPath is given', () => {
    const meta = buildMetadata({ title: 'T', pathname: '/blog', rssPath: '/blog/rss.xml' })
    expect(meta.alternates?.types).toEqual({
      'application/rss+xml': 'https://new.ximi4ka.ru/blog/rss.xml',
    })
    // canonical и hreflang остаются как были.
    expect(meta.alternates?.canonical).toBe('https://new.ximi4ka.ru/blog')
    expect(meta.alternates?.languages).toMatchObject({ ru: 'https://new.ximi4ka.ru/blog' })
  })

  it('maps type: product to a valid OG type (website)', () => {
    const meta = buildMetadata({ title: 'T', pathname: '/product/foo', type: 'product' })
    // Next's OpenGraph union keeps `type` narrowed per variant; cast for the assertion.
    expect((meta.openGraph as { type?: string } | undefined)?.type).toBe('website')
  })

  it('keeps type: article when passed', () => {
    const meta = buildMetadata({ title: 'T', pathname: '/a', type: 'article' })
    expect((meta.openGraph as { type?: string } | undefined)?.type).toBe('article')
  })

  it('builds Twitter card with summary_large_image', () => {
    const meta = buildMetadata({
      title: 'Hi',
      description: 'Desc',
      ogImage: 'https://cdn.example.com/og.jpg',
      pathname: '/x',
    })
    expect(meta.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'Hi',
      description: 'Desc',
    })
    expect(meta.twitter?.images).toEqual(['https://cdn.example.com/og.jpg'])
  })

  it('emits an amphtml link under `other` when ampPath is provided', () => {
    const meta = buildMetadata({
      title: 'T',
      pathname: '/product/foo',
      ampPath: '/amp/product/foo',
    })
    expect(meta.other).toEqual({
      amphtml: 'https://new.ximi4ka.ru/amp/product/foo',
    })
  })

  it('leaves `other` undefined when ampPath is omitted', () => {
    const meta = buildMetadata({ title: 'T', pathname: '/' })
    expect(meta.other).toBeUndefined()
  })

  it('emits hreflang alternates for every supported locale + x-default', () => {
    const meta = buildMetadata({
      title: 'T',
      pathname: '/product/foo',
      alternatesByLocale: {
        ru: '/product/foo',
        en: '/en/product/foo',
      },
    })
    expect(meta.alternates?.languages).toEqual({
      ru: 'https://new.ximi4ka.ru/product/foo',
      en: 'https://new.ximi4ka.ru/en/product/foo',
      'x-default': 'https://new.ximi4ka.ru/product/foo',
    })
  })

  it('synthesizes alternates from pathname when none supplied', () => {
    const meta = buildMetadata({ title: 'T', pathname: '/categories' })
    expect(meta.alternates?.languages).toEqual({
      ru: 'https://new.ximi4ka.ru/categories',
      en: 'https://new.ximi4ka.ru/en/categories',
      'x-default': 'https://new.ximi4ka.ru/categories',
    })
  })

  it('strips a locale prefix from pathname when synthesizing alternates', () => {
    // Caller might pass `/en/product/foo` without thinking; strip it so
    // the RU alternate is `/product/foo`, not `/en/product/foo`.
    const meta = buildMetadata({ title: 'T', pathname: '/en/product/foo' })
    expect(meta.alternates?.languages).toEqual({
      ru: 'https://new.ximi4ka.ru/product/foo',
      en: 'https://new.ximi4ka.ru/en/product/foo',
      'x-default': 'https://new.ximi4ka.ru/product/foo',
    })
  })

  it('synthesizes alternates for the root path', () => {
    const meta = buildMetadata({ title: 'T', pathname: '/' })
    expect(meta.alternates?.languages).toEqual({
      ru: 'https://new.ximi4ka.ru/',
      en: 'https://new.ximi4ka.ru/en',
      'x-default': 'https://new.ximi4ka.ru/',
    })
  })

  it('sets OG locale to ru_RU by default and en_US when locale=en', () => {
    expect(buildMetadata({ title: 'T', pathname: '/' }).openGraph?.locale).toBe('ru_RU')
    expect(buildMetadata({ title: 'T', pathname: '/', locale: 'en' }).openGraph?.locale).toBe(
      'en_US',
    )
  })

  it('trims whitespace on metaTitle / metaDescription / canonicalUrl / ogImage', () => {
    const meta = buildMetadata({
      title: 'Base',
      metaTitle: '  Padded  ',
      metaDescription: '  Also padded  ',
      canonicalUrl: '  https://example.com/x  ',
      ogImage: '  https://cdn.example.com/og.jpg  ',
      pathname: '/y',
    })
    expect(meta.title).toBe('Padded')
    expect(meta.description).toBe('Also padded')
    expect(meta.alternates?.canonical).toBe('https://example.com/x')
    expect(meta.openGraph?.images).toEqual([{ url: 'https://cdn.example.com/og.jpg' }])
  })
})
