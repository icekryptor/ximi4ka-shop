import 'dotenv/config'
import 'reflect-metadata'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DataSource } from 'typeorm'
import { Product } from '../entities/Product.js'
import { ProductImage } from '../entities/ProductImage.js'
import { ProductCategory } from '../entities/ProductCategory.js'
import { Page } from '../entities/Page.js'
import { BlogPost } from '../entities/BlogPost.js'
import { Order } from '../entities/Order.js'
import { OrderItem } from '../entities/OrderItem.js'
import { OrderNotification } from '../entities/OrderNotification.js'
import { AdminUser } from '../entities/AdminUser.js'
import { AdminSession } from '../entities/AdminSession.js'
import { EntityRevision } from '../entities/EntityRevision.js'
import { Redirect } from '../entities/Redirect.js'
import { Media } from '../entities/Media.js'
import { SiteSettings } from '../entities/SiteSettings.js'

// Tests must NEVER touch the dev/prod database (DATABASE_URL): suites
// TRUNCATE tables between cases, which would wipe imported data. Under
// Vitest (it sets process.env.VITEST) the data source therefore resolves
// TEST_DATABASE_URL — defaulting to a local ximi4ka_shop_test database —
// and ignores DATABASE_URL entirely. The test database is created and
// migrated automatically by src/test/globalSetup.ts.
const TEST_DATABASE_URL_FALLBACK = 'postgres://localhost:5432/ximi4ka_shop_test'

function resolveDatabaseUrl(): string {
  if (process.env.VITEST) {
    return process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL_FALLBACK
  }
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set')
  }
  return url
}

export const databaseUrl = resolveDatabaseUrl()

// Managed Postgres (Neon, Railway, Supabase Cloud) requires TLS; Postgres we
// run ourselves — localhost in dev, the `db` container on the VPS — does not,
// and offering SSL to a server without it fails with "The server does not
// support SSL connections". rejectUnauthorized:false avoids bundling provider
// CA chains (their pooler certs don't always validate against the system store).
//
// Heuristic: a hostname without a dot is either localhost or a docker-network
// alias (`db`, `supabase-db`) — ours, no TLS. A dotted FQDN is somebody's
// managed service — TLS. Force either way with DATABASE_SSL=true|false.
export function resolveSslFor(
  url: string,
  flag: string | undefined = process.env.DATABASE_SSL,
): false | { rejectUnauthorized: false } {
  if (flag === 'true') return { rejectUnauthorized: false }
  if (flag === 'false') return false

  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return { rejectUnauthorized: false }
  }
  // new URL() keeps IPv6 literals in brackets.
  hostname = hostname.replace(/^\[|\]$/g, '')

  const isOurs =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    !hostname.includes('.')
  return isOurs ? false : { rejectUnauthorized: false }
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  ssl: resolveSslFor(databaseUrl),
  // ALWAYS false — schema changes go through migrations.
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  entities: [
    Product,
    ProductImage,
    ProductCategory,
    Page,
    BlogPost,
    Order,
    OrderItem,
    OrderNotification,
    AdminUser,
    AdminSession,
    EntityRevision,
    Redirect,
    Media,
    SiteSettings,
  ],
  // Module-relative and extension-agnostic on purpose: a cwd-relative
  // 'src/migrations/*.ts' resolves to nothing once the api runs from dist/ in
  // the container (that is why migrations used to be applied by hand from a
  // laptop). This glob matches src/*.ts under tsx and dist/*.js in production.
  migrations: [path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations/*.{ts,js}')],
})
