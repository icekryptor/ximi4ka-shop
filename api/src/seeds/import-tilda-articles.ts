// Import the four real blog articles from the old Tilda site (ximi4ka.ru)
// into blog_posts.
//
// Two input modes (mirrors import-tilda-catalog.ts):
//   --crawl <dir>   extract from a raw crawl (<dir>/site/*.html, matched to
//                   articles by <link rel="canonical">), refresh
//                   api/data/tilda-articles.json, then import into the DB;
//   (no --crawl)    import from the committed api/data/tilda-articles.json.
//
// Flags:
//   --dry-run       extract + print the plan, no DB writes and no data-file
//                   writes.
//
// The import is idempotent: posts are upserted by slug (soft-deleted rows
// with a matching slug are restored). published_at is spread across the last
// few days (publishedDaysAgo per article) so the /blog listing keeps the
// editorial order with the strongest article on top.
import 'reflect-metadata'
import 'dotenv/config'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pino from 'pino'
import {
  ARTICLE_SOURCES,
  type ArticleBlock,
  deriveExcerpt,
  extractArticleBlocks,
  extractCanonicalUrl,
  extractMetaDescription,
} from './_lib/tilda-article.js'

const logger = pino().child({ mod: 'import-tilda-articles' })

// api/ package root (this file lives at api/src/seeds/).
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATA_DIR = path.join(API_ROOT, 'data')
const ARTICLES_JSON_PATH = path.join(DATA_DIR, 'tilda-articles.json')

interface ArticleEntry {
  sourceUrl: string
  slug: string
  title: string
  rubric: string
  excerpt: string | null
  coverImageUrl: string | null
  metaDescription: string | null
  blocks: ArticleBlock[]
  publishedDaysAgo: number
}

interface CliArgs {
  crawlDir: string | null
  dryRun: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { crawlDir: null, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--crawl') {
      const dir = argv[++i]
      if (!dir) {
        console.error('--crawl requires a directory argument')
        process.exit(2)
      }
      args.crawlDir = dir
    } else if (a === '--dry-run') {
      args.dryRun = true
    } else {
      console.error(`unknown argument: ${a}`)
      console.error('Usage: tsx import-tilda-articles.ts [--crawl <dir>] [--dry-run]')
      process.exit(2)
    }
  }
  return args
}

// ---- Extraction from a raw crawl ----

// The crawl saves site pages under hashed filenames — index them by their
// <link rel="canonical"> URL instead of guessing the hash.
async function indexPagesByCanonicalUrl(siteDir: string): Promise<Map<string, string>> {
  const byUrl = new Map<string, string>()
  const files = (await readdir(siteDir)).filter((f) => f.endsWith('.html'))
  for (const file of files) {
    const html = await readFile(path.join(siteDir, file), 'utf-8')
    const url = extractCanonicalUrl(html)
    if (url) byUrl.set(url.replace(/\/$/, ''), html)
  }
  return byUrl
}

async function extractArticles(crawlDir: string): Promise<ArticleEntry[]> {
  const siteDir = path.join(crawlDir, 'site')
  const pagesByUrl = await indexPagesByCanonicalUrl(siteDir)
  logger.info({ siteDir, pages: pagesByUrl.size }, 'site pages indexed')

  const entries: ArticleEntry[] = []
  for (const source of ARTICLE_SOURCES) {
    const html = pagesByUrl.get(source.sourceUrl.replace(/\/$/, ''))
    if (!html) {
      throw new Error(
        `no crawled page for ${source.sourceUrl} (${source.slug}) — ` +
          `download the live page into ${siteDir} and re-run`,
      )
    }
    const blocks = extractArticleBlocks(html, source.title)
    if (blocks.length === 0) throw new Error(`no content extracted for ${source.slug}`)
    const firstImage = blocks.find((b): b is Extract<ArticleBlock, { type: 'image' }> => b.type === 'image')
    entries.push({
      sourceUrl: source.sourceUrl,
      slug: source.slug,
      title: source.title,
      rubric: source.rubric,
      excerpt: deriveExcerpt(blocks),
      coverImageUrl: firstImage?.url ?? null,
      metaDescription: extractMetaDescription(html),
      blocks,
      publishedDaysAgo: source.publishedDaysAgo,
    })
  }
  return entries
}

async function writeDataFile(entries: ArticleEntry[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(ARTICLES_JSON_PATH, `${JSON.stringify(entries, null, 2)}\n`, 'utf-8')
  logger.info({ path: ARTICLES_JSON_PATH, entries: entries.length }, 'data file written')
}

async function readArticlesFromDataFile(): Promise<ArticleEntry[]> {
  const raw = await readFile(ARTICLES_JSON_PATH, 'utf-8')
  return JSON.parse(raw) as ArticleEntry[]
}

// ---- DB import ----

function publishedAtFor(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
}

async function importArticles(entries: ArticleEntry[]): Promise<void> {
  // Lazy-load DB modules so --dry-run works without DATABASE_URL set.
  const { AppDataSource } = await import('../config/dataSource.js')
  const { BlogPost } = await import('../entities/BlogPost.js')

  await AppDataSource.initialize()
  try {
    const repo = AppDataSource.getRepository(BlogPost)
    let created = 0
    let updated = 0
    for (const entry of entries) {
      let post = await repo.findOne({ where: { slug: entry.slug }, withDeleted: true })
      if (post) {
        updated++
      } else {
        post = repo.create({ slug: entry.slug })
        created++
      }
      post.title = entry.title
      post.excerpt = entry.excerpt
      post.coverImageUrl = entry.coverImageUrl
      post.rubric = entry.rubric
      post.blocks = entry.blocks
      post.metaDescription = entry.metaDescription
      post.isPublished = true
      post.publishedAt = publishedAtFor(entry.publishedDaysAgo)
      post.deletedAt = null
      await repo.save(post)
    }
    logger.info({ created, updated, total: entries.length }, 'blog posts upserted')
  } finally {
    await AppDataSource.destroy()
  }
}

function printPlan(entries: ArticleEntry[], args: CliArgs): void {
  console.log('')
  console.log('=== Tilda blog articles import ===')
  console.log(`Mode:    ${args.dryRun ? 'DRY RUN (no writes)' : 'LIVE (upsert by slug)'}`)
  console.log(`Source:  ${args.crawlDir ? `crawl ${args.crawlDir}` : ARTICLES_JSON_PATH}`)
  for (const e of entries) {
    const counts = new Map<string, number>()
    for (const b of e.blocks) counts.set(b.type, (counts.get(b.type) ?? 0) + 1)
    const summary = [...counts.entries()].map(([t, n]) => `${t}:${n}`).join(' ')
    console.log(
      `  /blog/${e.slug.padEnd(28)} −${e.publishedDaysAgo}d  [${summary}]` +
        `${e.coverImageUrl ? ' cover' : ''}${e.metaDescription ? ' meta' : ''}`,
    )
  }
  console.log('')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  const entries = args.crawlDir
    ? await extractArticles(path.resolve(args.crawlDir))
    : await readArticlesFromDataFile()

  printPlan(entries, args)

  if (args.dryRun) {
    console.log('Dry-run complete — no DB writes, no data-file writes.')
    return
  }

  if (args.crawlDir) await writeDataFile(entries)
  await importArticles(entries)
  logger.info('import complete')
}

main().catch((err) => {
  logger.error({ err }, 'import failed')
  process.exit(1)
})
