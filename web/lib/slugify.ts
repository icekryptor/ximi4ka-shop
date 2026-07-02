// Cyrillic-aware slugify for admin forms (live slug transliteration).
//
// Port of api/src/seeds/_lib/slugify.ts — kept as a copy because the api
// workspace isn't importable from web (only @ximi4ka-shop/shared is), and
// the transliteration table is stable. If you change one, change both;
// both test suites pin the same behaviour.

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
