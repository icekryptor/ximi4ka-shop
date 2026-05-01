'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  CategoryFilterBar,
  type SortKey,
} from '@/components/marketing/CategoryFilterBar'

interface Props {
  currentSort: SortKey
}

// Thin client wrapper that bridges the v3 <CategoryFilterBar> (a 'use client'
// component with imperative onSortChange / onReset callbacks) to the App
// Router. The category page itself stays a Server Component — only this
// island is client-side.
export function CategoryFilterBarMount({ currentSort }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateSort = (s: SortKey) => {
    const params = new URLSearchParams(searchParams.toString())
    if (s === 'newest') {
      // 'newest' is the default sort — keep URLs clean by not serialising it.
      params.delete('sort')
    } else {
      params.set('sort', s)
    }
    // Reset pagination on sort change so the user lands on page 1 of the new
    // ordering. Keeps the URL contract symmetric whenever pagination is wired.
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const reset = () => {
    router.push(pathname)
  }

  return (
    <CategoryFilterBar
      sort={currentSort}
      onSortChange={updateSort}
      onReset={reset}
    />
  )
}
