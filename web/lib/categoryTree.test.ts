import { describe, it, expect } from 'vitest'
import {
  buildCategoryTree,
  flattenTree,
  descendantIds,
  type CategoryTreeNode,
} from './categoryTree'
import type { ProductCategory } from '@ximi4ka-shop/shared'

function cat(
  id: string,
  name: string,
  parentId: string | null,
  sortOrder = 0,
  productCount = 0,
): ProductCategory & { productCount: number } {
  return {
    id,
    slug: id,
    name,
    parentId,
    metaTitle: null,
    metaDescription: null,
    sortOrder,
    translations: {},
    productCount,
  }
}

describe('buildCategoryTree', () => {
  it('nests children under parents', () => {
    const flat = [
      cat('root', 'Root', null),
      cat('a', 'A', 'root'),
      cat('b', 'B', 'root'),
      cat('a1', 'A1', 'a'),
    ]
    const tree = buildCategoryTree(flat)
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('root')
    expect(tree[0].children.map((c) => c.id).sort()).toEqual(['a', 'b'])
    const a = tree[0].children.find((c) => c.id === 'a')!
    expect(a.children.map((c) => c.id)).toEqual(['a1'])
  })

  it('assigns correct depth per level', () => {
    const flat = [
      cat('r', 'R', null),
      cat('c1', 'C1', 'r'),
      cat('c2', 'C2', 'c1'),
      cat('c3', 'C3', 'c2'),
    ]
    const tree = buildCategoryTree(flat)
    const flat2 = flattenTree(tree)
    const byId = Object.fromEntries(flat2.map((n) => [n.id, n.depth]))
    expect(byId).toEqual({ r: 0, c1: 1, c2: 2, c3: 3 })
  })

  it('promotes orphans (missing parent) to roots', () => {
    // 'a' points to 'missing' which isn't in the list — should become a root.
    const flat = [cat('r', 'R', null), cat('a', 'Orphan', 'missing')]
    const tree = buildCategoryTree(flat)
    const ids = tree.map((n) => n.id).sort()
    expect(ids).toEqual(['a', 'r'])
    const orphan = tree.find((n) => n.id === 'a')!
    expect(orphan.depth).toBe(0)
  })

  it('sorts by sortOrder then name', () => {
    const flat = [
      cat('r', 'R', null),
      cat('b', 'Zebra', 'r', 1),
      cat('a', 'Apple', 'r', 1),
      cat('c', 'Carrot', 'r', 0),
    ]
    const tree = buildCategoryTree(flat)
    const kids = tree[0].children.map((c) => c.id)
    // sortOrder 0 first (c), then sortOrder 1 sorted by name: Apple (a), Zebra (b).
    expect(kids).toEqual(['c', 'a', 'b'])
  })
})

describe('flattenTree', () => {
  it('preserves DFS order (parent before children)', () => {
    const flat = [
      cat('r', 'R', null),
      cat('c1', 'C1', 'r', 0),
      cat('c2', 'C2', 'r', 1),
      cat('c1a', 'C1A', 'c1'),
    ]
    const tree = buildCategoryTree(flat)
    const order = flattenTree(tree).map((n) => n.id)
    expect(order).toEqual(['r', 'c1', 'c1a', 'c2'])
  })
})

describe('descendantIds', () => {
  it('returns all descendants but excludes self', () => {
    const flat = [
      cat('r', 'R', null),
      cat('a', 'A', 'r'),
      cat('b', 'B', 'r'),
      cat('a1', 'A1', 'a'),
      cat('a1x', 'A1X', 'a1'),
    ]
    const tree = buildCategoryTree(flat)
    const root = tree[0] as CategoryTreeNode
    expect(descendantIds(root).sort()).toEqual(['a', 'a1', 'a1x', 'b'])
    const a = root.children.find((c) => c.id === 'a')!
    expect(descendantIds(a).sort()).toEqual(['a1', 'a1x'])
    // Leaf: a1x has no children, so no descendants.
    const leaf = a.children[0].children[0]
    expect(leaf.id).toBe('a1x')
    expect(descendantIds(leaf)).toEqual([])
  })
})
