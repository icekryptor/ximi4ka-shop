import 'dotenv/config'
import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { Product } from '../entities/Product.js'
import { ProductImage } from '../entities/ProductImage.js'
import { ProductCategory } from '../entities/ProductCategory.js'
import { Page } from '../entities/Page.js'
import { BlogPost } from '../entities/BlogPost.js'
import { Order } from '../entities/Order.js'
import { OrderItem } from '../entities/OrderItem.js'
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

// Managed Postgres (Neon, Railway, Supabase) requires TLS; local dev/test on
// localhost does not. rejectUnauthorized:false avoids bundling provider CA
// chains (their pooler certs don't always validate against the system store).
// Force on/off explicitly with DATABASE_SSL=true|false when the heuristic is
// wrong (e.g. a remote host reached over a private network without TLS).
function resolveSsl(): false | { rejectUnauthorized: false } {
  const flag = process.env.DATABASE_SSL
  if (flag === 'true') return { rejectUnauthorized: false }
  if (flag === 'false') return false
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(databaseUrl)
  return isLocal ? false : { rejectUnauthorized: false }
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  ssl: resolveSsl(),
  // ALWAYS false — schema changes go through migrations.
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  entities: [
    Product, ProductImage, ProductCategory,
    Page, BlogPost, Order, OrderItem,
    AdminUser, AdminSession, EntityRevision, Redirect,
    Media, SiteSettings,
  ],
  migrations: ['src/migrations/*.ts'],
})
