import { In } from 'typeorm'
import { AppDataSource } from '../config/dataSource.js'
import { EntityRevision } from '../entities/EntityRevision.js'
import { Product } from '../entities/Product.js'
import { Page } from '../entities/Page.js'
import { ProductCategory } from '../entities/ProductCategory.js'
import { BlogPost } from '../entities/BlogPost.js'

// Revision tracking for admin-editable content. We snapshot the prior state
// of an entity before every update/delete and the initial state on create,
// so admins can browse a history and restore older versions.
//
// Only four entity types are tracked: `product`, `page`, `product_category`,
// `blog_post`. Orders, admin_users, and redirects are intentionally out of
// scope.

export type RevisionEntityType = 'product' | 'page' | 'product_category' | 'blog_post'

async function snapshotFor(
  entityType: RevisionEntityType,
  entityId: string,
): Promise<Record<string, unknown> | null> {
  if (entityType === 'product') {
    // Products have a many-to-many `categories` link we want to round-trip
    // through revisions, so we load that relation and store just the IDs.
    const product = await AppDataSource.getRepository(Product).findOne({
      where: { id: entityId },
      relations: { categories: true },
    })
    if (!product) return null
    const { categories, ...columns } = product
    return {
      ...columns,
      categoryIds: categories?.map((c) => c.id) ?? [],
    }
  }
  if (entityType === 'page') {
    const page = await AppDataSource.getRepository(Page).findOneBy({ id: entityId })
    return page ? { ...page } : null
  }
  if (entityType === 'product_category') {
    const cat = await AppDataSource.getRepository(ProductCategory).findOneBy({ id: entityId })
    return cat ? { ...cat } : null
  }
  if (entityType === 'blog_post') {
    const post = await AppDataSource.getRepository(BlogPost).findOneBy({ id: entityId })
    return post ? { ...post } : null
  }
  return null
}

// Writes a snapshot of the current state of `entityId` to entity_revisions.
// Silently no-ops if the entity doesn't exist (e.g. called before a freshly
// created row is visible — not our pattern, but safe).
export async function writeRevision(
  entityType: RevisionEntityType,
  entityId: string,
  editedBy: string | null,
): Promise<void> {
  const snapshot = await snapshotFor(entityType, entityId)
  if (!snapshot) return
  const repo = AppDataSource.getRepository(EntityRevision)
  await repo.save(
    repo.create({
      entityType,
      entityId,
      snapshot,
      editedBy,
    }),
  )
}

// Applies a revision back to its originating entity. Returns the target's
// identifier on success, or null if the revision id is unknown.
//
// Intentionally does NOT snapshot the current state first — the caller is
// expected to do that (so restoring a restore is possible).
export async function restoreRevision(
  revisionId: string,
): Promise<{ entityType: RevisionEntityType; entityId: string } | null> {
  const revRepo = AppDataSource.getRepository(EntityRevision)
  const rev = await revRepo.findOneBy({ id: revisionId })
  if (!rev) return null

  const { entityId, snapshot } = rev
  const et = rev.entityType as RevisionEntityType

  if (et === 'product') {
    const productRepo = AppDataSource.getRepository(Product)
    const {
      categoryIds,
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...columns
    } = snapshot as Record<string, unknown>
    // Cast through `any` — TypeORM's _QueryDeepPartialEntity is overly strict
    // about jsonb/relation shapes on update() and doesn't accept our plain
    // snapshot dict. The snapshot was produced from the same entity shape,
    // so the runtime values match.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await productRepo.update({ id: entityId }, columns as any)
    // Re-sync the M2M category links. Missing IDs (e.g. a category deleted
    // since the snapshot) are simply skipped by findBy + In.
    if (Array.isArray(categoryIds)) {
      const product = await productRepo.findOne({
        where: { id: entityId },
        relations: { categories: true },
      })
      if (product) {
        const ids = (categoryIds as unknown[]).filter(
          (x): x is string => typeof x === 'string',
        )
        const cats = ids.length
          ? await AppDataSource.getRepository(ProductCategory).findBy({ id: In(ids) })
          : []
        product.categories = cats
        await productRepo.save(product)
      }
    }
  } else if (et === 'page') {
    const {
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...columns
    } = snapshot as Record<string, unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await AppDataSource.getRepository(Page).update({ id: entityId }, columns as any)
  } else if (et === 'product_category') {
    const { id: _id, ...columns } = snapshot as Record<string, unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await AppDataSource.getRepository(ProductCategory).update({ id: entityId }, columns as any)
  } else if (et === 'blog_post') {
    const {
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...columns
    } = snapshot as Record<string, unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await AppDataSource.getRepository(BlogPost).update({ id: entityId }, columns as any)
  } else {
    return null
  }

  return { entityType: et, entityId }
}
