import 'dotenv/config'
import 'reflect-metadata'
import { DataSource } from 'typeorm'

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
  // Entity dir is currently empty; populated in Task 1.3.
  entities: ['src/entities/*.ts'],
  migrations: ['src/migrations/*.ts'],
})
