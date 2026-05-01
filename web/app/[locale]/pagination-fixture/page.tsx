import { notFound } from 'next/navigation'
import { PaginationLJ } from '@/components/ui/PaginationLJ'

// Dev-only fixture route. Renders <PaginationLJ /> in four representative
// scenes so a Playwright spec can baseline the component visually across
// mobile / tablet / desktop projects.
//
// In production this route returns 404. The guard runs at request time
// (notFound() is server-only); the route is otherwise unlinked from any
// nav, so even in dev it's only reachable by typing the URL or by the
// visual regression spec.
//
// We deliberately place this OUTSIDE the (public) route group so the
// fixture renders WITHOUT the storefront chrome (Header/Footer/CartDrawer)
// — that keeps each baseline tightly cropped to the pagination component
// itself, isolating drift to the component under test.
//
// Note: the folder name has no underscore prefix because Next.js App
// Router treats `_folderName` directories as private folders that are
// EXCLUDED from routing. We rely on the production guard below instead.
export const dynamic = 'force-dynamic'

export default function PaginationFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <div className="bg-[var(--color-lj-cream)] min-h-screen p-12 flex flex-col gap-12">
      <div data-fixture-scene="middle-of-many">
        <h2 className="font-[var(--font-lj-mono)] uppercase mb-4 text-[var(--color-lj-ink)] text-sm tracking-[0.08em]">
          middle of many pages
        </h2>
        <PaginationLJ
          currentPage={6}
          totalPages={12}
          totalResults={144}
          resultsPerPage={12}
          basePath="/x"
        />
      </div>

      <div data-fixture-scene="few-pages">
        <h2 className="font-[var(--font-lj-mono)] uppercase mb-4 text-[var(--color-lj-ink)] text-sm tracking-[0.08em]">
          few pages (no ellipsis)
        </h2>
        <PaginationLJ
          currentPage={3}
          totalPages={5}
          totalResults={50}
          resultsPerPage={12}
          basePath="/x"
        />
      </div>

      <div data-fixture-scene="first-page">
        <h2 className="font-[var(--font-lj-mono)] uppercase mb-4 text-[var(--color-lj-ink)] text-sm tracking-[0.08em]">
          first page (back disabled)
        </h2>
        <PaginationLJ
          currentPage={1}
          totalPages={12}
          totalResults={144}
          resultsPerPage={12}
          basePath="/x"
        />
      </div>

      <div data-fixture-scene="last-page">
        <h2 className="font-[var(--font-lj-mono)] uppercase mb-4 text-[var(--color-lj-ink)] text-sm tracking-[0.08em]">
          last page (forward disabled, partial range)
        </h2>
        <PaginationLJ
          currentPage={12}
          totalPages={12}
          totalResults={140}
          resultsPerPage={12}
          basePath="/x"
        />
      </div>
    </div>
  )
}
