// Cyrillic-aware slugify for the Tilda CSV importer.
//
// We intentionally do not use the workspace's `slugify` dependency because
// (a) it returns escape-encoded Cyrillic for unmapped chars and (b) we want
// full control over the transliteration table for product slugs that will
// be persisted as URL path segments.

const RU_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo',
  ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '',
  ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .map((c) => RU_TO_LATIN[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Ensures uniqueness by appending -2, -3, ... when a slug is already in
// `seen`. Mutates `seen` to include the chosen slug. If `base` is empty,
// uses 'item' as a fallback so we never produce an empty string.
export function dedupeSlug(base: string, seen: Set<string>): string {
  const root = base || 'item'
  if (!seen.has(root)) {
    seen.add(root)
    return root
  }
  for (let i = 2; ; i++) {
    const candidate = `${root}-${i}`
    if (!seen.has(candidate)) {
      seen.add(candidate)
      return candidate
    }
  }
}
