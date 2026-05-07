import { notFound } from 'next/navigation'
import { SpecimenCard } from '@/components/ui/SpecimenCard'

// Dev-only fixture route. Renders <SpecimenCard /> in two representative
// scenes (card + pdp size variants) so a Playwright spec can baseline the
// component visually across mobile / tablet / desktop projects.
//
// In production this route returns 404. The guard runs at request time
// (notFound() is server-only); the route is otherwise unlinked from any
// nav, so even in dev it's only reachable by typing the URL or by the
// visual regression spec.
//
// We deliberately place this OUTSIDE the (public) route group so the
// fixture renders WITHOUT the storefront chrome (Header/Footer/CartDrawer)
// — that keeps each baseline tightly cropped to the SpecimenCard itself,
// isolating drift to the component under test.
//
// Pattern mirrors the Stage 10 `pagination-fixture` route — same
// dynamic = 'force-dynamic' guard, same data-fixture-scene anchor pattern.
export const dynamic = 'force-dynamic'

export default function SpecimenFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <div className="bg-[var(--color-lj-cream)] min-h-screen p-12 flex flex-col gap-12">
      <div data-fixture-scene="card-size">
        <h2 className="font-[var(--font-lj-mono)] uppercase mb-4 text-[var(--color-lj-ink)] text-sm tracking-[0.08em]">
          card size (4:5)
        </h2>
        <div className="w-[320px]">
          <SpecimenCard sku="X-30" size="card" />
        </div>
      </div>

      <div data-fixture-scene="pdp-size">
        <h2 className="font-[var(--font-lj-mono)] uppercase mb-4 text-[var(--color-lj-ink)] text-sm tracking-[0.08em]">
          pdp size (1:1)
        </h2>
        <div className="w-[600px]">
          <SpecimenCard sku="K-12" size="pdp" />
        </div>
      </div>
    </div>
  )
}
