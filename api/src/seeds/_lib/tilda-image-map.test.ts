import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectTildaUrls, saveTildaImageMap } from '../../lib/tildaImages.js'
import { remapSeedImages } from './tilda-image-map.js'

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../data')

describe('remapSeedImages', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'tilda-seed-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function loadCatalog() {
    return JSON.parse(await readFile(path.join(dataDir, 'tilda-catalog.json'), 'utf-8')) as Array<{
      images: Array<{ url: string; alt: string }>
    }>
  }

  it('подставляет перенесённые картинки в копию каталога, оригинал не трогает', async () => {
    const catalog = await loadCatalog()
    const urls = new Set<string>()
    collectTildaUrls(catalog, urls)
    const mapFile = path.join(dir, 'map.json')
    await saveTildaImageMap(
      mapFile,
      new Map([...urls].map((u, i) => [u, `/uploads/tilda/${i}.png`])),
    )

    const log = vi.fn()
    const out = await remapSeedImages(catalog, { imageMap: mapFile, noImageMap: false }, log)

    expect(out[0]!.images[0]!.url).toMatch(/^\/uploads\/tilda\/\d+\.png$/)
    expect(out[0]!.images[0]!.alt).toBe(catalog[0]!.images[0]!.alt)
    expect(catalog[0]!.images[0]!.url).toContain('tildacdn.com')
    expect(log).toHaveBeenCalledWith({ mapped: urls.size, replaced: expect.any(Number) })
    const left = new Set<string>()
    collectTildaUrls(out, left)
    expect(left.size).toBe(0)
  })

  it('--no-image-map оставляет данные как есть', async () => {
    const catalog = await loadCatalog()
    const out = await remapSeedImages(catalog, { imageMap: null, noImageMap: true }, vi.fn())
    expect(out).toBe(catalog)
  })

  it('частичная карта: неперенесённые картинки остаются ссылками на Tilda', async () => {
    const catalog = await loadCatalog()
    const first = catalog[0]!.images[0]!.url
    const mapFile = path.join(dir, 'map.json')
    await saveTildaImageMap(mapFile, new Map([[first, '/uploads/tilda/only.png']]))
    const out = await remapSeedImages(catalog, { imageMap: mapFile, noImageMap: false }, vi.fn())
    expect(out[0]!.images[0]!.url).toBe('/uploads/tilda/only.png')
    expect(out[1]!.images[0]!.url).toContain('tildacdn.com')
  })
})
