import Link from 'next/link'

interface Props {
  currentPage: number      // 1-indexed
  totalPages: number
  totalResults: number
  resultsPerPage: number
  basePath: string         // e.g. '/categories/reaktivy'
  /** Named query params to preserve when changing page (besides 'page' itself). */
  preserveParams?: string[]
  /** Current values of those params, read from the page's searchParams. */
  currentParams?: Record<string, string | undefined>
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Compute the visible page numbers per design doc:
 * - totalPages <= 7: render all
 * - else: first 2 + last 2 + 3 around current, ellipsis (null) inserted between gaps > 1
 */
function buildRange(currentPage: number, totalPages: number): Array<number | null> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const around = new Set<number>([
    1, 2,
    currentPage - 1, currentPage, currentPage + 1,
    totalPages - 1, totalPages,
  ])
  const sorted = Array.from(around)
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b)
  const out: Array<number | null> = []
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i])
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) out.push(null)
  }
  return out
}

function buildHref(
  basePath: string,
  page: number,
  preserveParams: string[],
  currentParams: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams()
  for (const key of preserveParams) {
    const v = currentParams[key]
    if (v) params.set(key, v)
  }
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

export function PaginationLJ({
  currentPage,
  totalPages,
  totalResults,
  resultsPerPage,
  basePath,
  preserveParams = [],
  currentParams = {},
}: Props) {
  if (totalPages <= 1) return null

  const range = buildRange(currentPage, totalPages)
  const isFirst = currentPage <= 1
  const isLast = currentPage >= totalPages

  const startResult = (currentPage - 1) * resultsPerPage + 1
  const endResult = Math.min(currentPage * resultsPerPage, totalResults)

  const linkClass =
    'inline-flex items-center font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-70 hover:opacity-100 hover:text-[var(--color-lj-brand-deep)] transition-colors'
  const disabledClass =
    'inline-flex items-center font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-40 cursor-not-allowed'
  const currentClass =
    'inline-flex items-center font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] text-[var(--color-lj-brand)]'
  const sepClass = 'text-[var(--color-lj-brand)] mx-2'

  return (
    <nav
      aria-label="Пагинация"
      className="flex flex-col items-center gap-3 my-8"
    >
      <p className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-65">
        стр. {pad(currentPage)} из {pad(totalPages)} · показано {startResult}–{endResult} из {totalResults}
      </p>

      <div className="flex items-center flex-wrap justify-center gap-y-2">
        {/* Назад */}
        {isFirst ? (
          <span data-pagination-back className={disabledClass}>← НАЗАД</span>
        ) : (
          <Link
            data-pagination-back
            href={buildHref(basePath, currentPage - 1, preserveParams, currentParams)}
            className={linkClass}
          >
            ← НАЗАД
          </Link>
        )}
        <span className={sepClass}>·</span>

        {/* Numbered range */}
        {range.map((page, i) => {
          if (page === null) {
            return (
              <span key={`ellipsis-${i}`} data-pagination-ellipsis className="opacity-40 mx-1">
                ...
              </span>
            )
          }
          if (page === currentPage) {
            return (
              <span key={page} aria-current="page" className={currentClass}>
                [ {page} ]
              </span>
            )
          }
          return (
            <span key={page} className="inline-flex items-center">
              <Link
                href={buildHref(basePath, page, preserveParams, currentParams)}
                className={linkClass}
              >
                {page}
              </Link>
              {i < range.length - 1 && range[i + 1] !== null && <span className={sepClass}>·</span>}
            </span>
          )
        })}

        <span className={sepClass}>·</span>

        {/* Вперёд */}
        {isLast ? (
          <span data-pagination-next className={disabledClass}>ВПЕРЁД →</span>
        ) : (
          <Link
            data-pagination-next
            href={buildHref(basePath, currentPage + 1, preserveParams, currentParams)}
            className={linkClass}
          >
            ВПЕРЁД →
          </Link>
        )}
      </div>
    </nav>
  )
}
