import type { ProductCategory } from '@ximi4ka-shop/shared'

// Tree representation of categories. Flat inputs become nested nodes keyed by
// parentId. Depth is computed during build so list/select UIs can indent
// visually without a second pass.
export interface CategoryTreeNode extends ProductCategory {
  productCount?: number
  children: CategoryTreeNode[]
  depth: number
}

type FlatInput = ProductCategory & { productCount?: number }

const sortFn = (a: CategoryTreeNode, b: CategoryTreeNode): number =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)

// Builds a tree from a flat list. If a node points at a parent that isn't in
// the list (e.g. deleted), it's promoted to a root — orphans don't disappear.
export function buildCategoryTree(flat: FlatInput[]): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>()
  for (const cat of flat) {
    byId.set(cat.id, { ...cat, children: [], depth: 0 })
  }
  const roots: CategoryTreeNode[] = []
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      const parent = byId.get(node.parentId)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })

  // Recursively propagate depth in case children were inserted before their
  // parent's depth was established. A simple second pass keeps the invariant
  // true regardless of Map iteration order.
  function fixDepth(node: CategoryTreeNode, depth: number) {
    node.depth = depth
    for (const c of node.children) fixDepth(c, depth + 1)
  }
  for (const r of roots) fixDepth(r, 0)

  function sort(nodes: CategoryTreeNode[]) {
    nodes.sort(sortFn)
    for (const n of nodes) if (n.children.length) sort(n.children)
  }
  sort(roots)
  return roots
}

// DFS flatten — parent first, then its children, preserving the same order as
// the nested render.
export function flattenTree(nodes: CategoryTreeNode[]): CategoryTreeNode[] {
  const out: CategoryTreeNode[] = []
  function walk(list: CategoryTreeNode[]) {
    for (const n of list) {
      out.push(n)
      walk(n.children)
    }
  }
  walk(nodes)
  return out
}

// All descendant ids of a node (excluding the node itself). Used by the
// parent selector to prevent cycles — you cannot parent yourself, nor any of
// your descendants.
export function descendantIds(node: CategoryTreeNode): string[] {
  const ids: string[] = []
  function walk(list: CategoryTreeNode[]) {
    for (const n of list) {
      ids.push(n.id)
      walk(n.children)
    }
  }
  walk(node.children)
  return ids
}
