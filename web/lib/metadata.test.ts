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
    expect(
      buildMetadata({ title: 'T', description: 'D', pathname: '/' }).description,
    ).toBe('D')
    expect(buildMetadata({ title: 'T', pathname: '/' }).description).toBeUndefined()
  })

  it('builds absolute canonical from pathname + default site URL', () => {
    const meta = buildMetadata({ title: 'T', pathname: '/product/foo' })
    expect(meta.alternates?.canonical).toBe('https://shop.ximi4ka.ru/product/foo')
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
      url: 'https://shop.ximi4ka.ru/foo',
      siteName: 'Ximi4ka',
      locale: 'ru_RU',
    })
    expect((meta.openGraph as { type?: string } | undefined)?.type).toBe('website')
    expect(meta.openGraph?.images).toEqual([{ url: 'https://cdn.example.com/og.jpg' }])
  })

  it('falls back to default OG image when none provided', () => {
    const meta = buildMetadata({ title: 'T', pathname: '/' })
    expect(meta.openGraph?.images).toEqual([
      { url: 'https://shop.ximi4ka.ru/og-default.png' },
    ])
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
      amphtml: 'https://shop.ximi4ka.ru/amp/product/foo',
    })
  })

  it('leaves `other` undefined when ampPath is omitted', () => {
    const meta = buildMetadata({ title: 'T', pathname: '/' })
    expect(meta.other).toBeUndefined()
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
