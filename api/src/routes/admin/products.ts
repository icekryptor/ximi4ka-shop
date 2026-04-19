import { Router } from 'express'
import { IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import {
  CreateProductSchema,
  UpdateProductSchema,
  ListQuerySchema,
} from './products.schemas.js'
import { conflict, notFound } from '../errors.js'

export const adminProductsRouter: Router = Router()

// TODO(phase-3): adminProductsRouter.use(requireAdminAuth())

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  )
}

// List
adminProductsRouter.get('/', async (req, res, next) => {
  try {
    const { limit, offset } = ListQuerySchema.parse(req.query)
    const repo = AppDataSource.getRepository(Product)
    const [items, total] = await repo.findAndCount({
      where: { deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
      skip: offset,
      take: limit,
    })
    res.json({ data: items, pagination: { limit, offset, total } })
  } catch (err) {
    next(err)
  }
})

// Get by id
adminProductsRouter.get('/:id', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Product)
    const product = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!product) throw notFound('product_not_found', 'Product not found')
    res.json({ data: product })
  } catch (err) {
    next(err)
  }
})

// Create
adminProductsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = CreateProductSchema.parse(req.body)
    const repo = AppDataSource.getRepository(Product)
    const entity = repo.create(parsed)
    const saved = await repo.save(entity)
    res.status(201).json({ data: saved })
  } catch (err) {
    if (isUniqueViolation(err)) {
      next(conflict('slug_conflict', 'A product with this slug already exists'))
      return
    }
    next(err)
  }
})

// Update
adminProductsRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = UpdateProductSchema.parse(req.body)
    const repo = AppDataSource.getRepository(Product)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('product_not_found', 'Product not found')
    const merged = repo.merge(existing, parsed)
    const saved = await repo.save(merged)
    res.json({ data: saved })
  } catch (err) {
    if (isUniqueViolation(err)) {
      next(conflict('slug_conflict', 'A product with this slug already exists'))
      return
    }
    next(err)
  }
})

// Publish
adminProductsRouter.post('/:id/publish', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Product)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('product_not_found', 'Product not found')
    existing.isPublished = true
    const saved = await repo.save(existing)
    res.json({ data: saved })
  } catch (err) {
    next(err)
  }
})

// Unpublish
adminProductsRouter.post('/:id/unpublish', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Product)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('product_not_found', 'Product not found')
    existing.isPublished = false
    const saved = await repo.save(existing)
    res.json({ data: saved })
  } catch (err) {
    next(err)
  }
})

// Soft delete
adminProductsRouter.delete('/:id', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Product)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('product_not_found', 'Product not found')
    await repo.softRemove(existing)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
