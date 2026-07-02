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

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
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
