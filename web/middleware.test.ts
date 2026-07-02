import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware, __resetCache } from './middleware'

// Light-weight unit tests for the edge middleware. We exercise the
// exported function directly with a NextRequest; the Next runtime isn't
// actually booted (that would require a full e2e test). The goals:
//   - excluded prefixes (admin, api, _next, uploads) never redirect
//   - unknown paths fall through to NextResponse.next()
//   - matching paths produce a redirect with the configured status
//   - the hit endpoint is pinged fire-and-forget

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`))
}

describe('redirect middleware', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockReset()
    __resetCache()
    process.env.NEXT_PUBLIC_API_URL = 'http://api.test'
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.NEXT_PUBLIC_API_URL
    delete process.env.API_URL
  })

  it('skips admin paths without calling the API', async () => {
    const res = await middleware(makeRequest('/admin/redirects'))
    // NextResponse.next() passes through — no Location header.
    expect(res.headers.get('location')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips /api paths without calling the API', async () => {
    const res = await middleware(makeRequest('/api/public/products'))
    expect(res.headers.get('location')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips /fonts/* without locale-rewriting (so /fonts/foo.woff2 hits the static handler)', async () => {
    const res = await middleware(makeRequest('/fonts/MazzardH-ExtraBold.woff2'))
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.headers.get('location')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips /_next, /uploads, /favicon.ico', async () => {
    for (const p of ['/_next/static/foo', '/uploads/x.jpg', '/favicon.ico']) {
      const res = await middleware(makeRequest(p))
      expect(res.headers.get('location')).toBeNull()
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches the redirects list and falls through to a locale rewrite on no match', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const res = await middleware(makeRequest('/some-page'))
    // No Location (it's a rewrite, not a redirect) but the rewrite
    // header carries the internal URL for debugging.
    expect(res.headers.get('location')).toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'http://api.test/api/public/redirects',
    )
    // Rewrote to /ru/some-page internally.
    expect(res.headers.get('x-middleware-rewrite')).toContain('/ru/some-page')
  })

  it('redirects matching path with the configured status and posts a hit', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/api/public/redirects') && !url.includes('/hit')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'redirect-1',
                fromPath: '/old-path',
                toPath: '/new-path',
                statusCode: 301,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(null, { status: 204 })
    })

    const res = await middleware(makeRequest('/old-path'))
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('http://localhost:3000/new-path')

    // Fire-and-forget hit. The call is dispatched but not awaited, so we
    // wait one microtask tick for it to enter the fetch mock.
    await Promise.resolve()
    const hitCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('/api/public/redirects/redirect-1/hit'),
    )
    expect(hitCall).toBeDefined()
    expect(hitCall?.[1]?.method).toBe('POST')
  })

  it('supports absolute http(s) to_path as-is', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/public/redirects')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'redirect-2',
                fromPath: '/ext',
                toPath: 'https://example.com/landing',
                statusCode: 302,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(null, { status: 204 })
    })
    const res = await middleware(makeRequest('/ext'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://example.com/landing')
  })

  it('skips locale rewrite for /robots.txt, /sitemap.xml, /yml.xml, /turbo.xml, /blog/rss.xml, /llms.txt, /amp/*', async () => {
    for (const p of [
      '/robots.txt',
      '/sitemap.xml',
      '/yml.xml',
      '/turbo.xml',
      '/blog/rss.xml',
      '/llms.txt',
      '/amp/product/foo',
    ]) {
      const res = await middleware(makeRequest(p))
      expect(res.headers.get('x-middleware-rewrite')).toBeNull()
      expect(res.headers.get('location')).toBeNull()
    }
    // None of those should have hit the redirects endpoint either.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still locale-rewrites /blog pages (only the feed is excluded)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const res = await middleware(makeRequest('/blog/pochemu-plamya-sinee'))
    expect(res.headers.get('x-middleware-rewrite')).toContain(
      '/ru/blog/pochemu-plamya-sinee',
    )
  })

  it('rewrites unprefixed requests internally to /ru (invisible to user)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const res = await middleware(makeRequest('/product/foo'))
    // Rewrite, not redirect — no Location, but x-middleware-rewrite set.
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('x-middleware-rewrite')).toContain('/ru/product/foo')
  })

  it('rewrites the root path to /ru', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const res = await middleware(makeRequest('/'))
    expect(res.headers.get('x-middleware-rewrite')).toContain('/ru')
  })

  it('passes through /en-prefixed URLs without rewriting', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const res = await middleware(makeRequest('/en/product/foo'))
    // No rewrite header — Next sees the /en prefix and routes to [locale].
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.headers.get('location')).toBeNull()
  })

  it('passes through /ru-prefixed URLs without double-rewriting', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const res = await middleware(makeRequest('/ru/product/foo'))
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.headers.get('location')).toBeNull()
  })

  it('caches the list for 60s — second request within window does not re-fetch', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/public/redirects')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'r1',
                fromPath: '/a',
                toPath: '/b',
                statusCode: 301,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(null, { status: 204 })
    })

    // First request populates the cache + dispatches a hit.
    await middleware(makeRequest('/a'))
    // Let the fire-and-forget hit fetch settle before we clear.
    await Promise.resolve()
    fetchMock.mockClear()

    // Second request (well within 60s) should NOT re-fetch the list. It
    // may still POST a hit, but no list GET should appear in the calls.
    await middleware(makeRequest('/a'))
    const listCall = fetchMock.mock.calls.find(
      (c) =>
        String(c[0]).endsWith('/api/public/redirects') &&
        !String(c[0]).includes('/hit'),
    )
    expect(listCall).toBeUndefined()
  })
})
