import 'dotenv/config'
import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { Product } from '../entities/Product.js'
import { ProductImage } from '../entities/ProductImage.js'
import { ProductCategory } from '../entities/ProductCategory.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set')
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  // ALWAYS false — schema changes go through migrations.
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  entities: [Product, ProductImage, ProductCategory],
  migrations: ['src/migrations/*.ts'],
})
