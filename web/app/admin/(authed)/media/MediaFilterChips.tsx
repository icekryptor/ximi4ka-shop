'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

// "Все" / "Изображения" filter pills that map to ?type=all|image. Using Link
// instead of router.push so the selection is bookmarkable and "Открыть в новой
// вкладке" works like the rest of the admin.
export function MediaFilterChips({ active }: { active: 'all' | 'image' }) {
  const params = useSearchParams()

  function hrefFor(value: 'all' | 'image') {
    const next = new URLSearchParams(params?.toString() ?? '')
    if (value === 'all') next.delete('type')
    else next.set('type', value)
    next.delete('offset')
    return `/admin/media${next.toString() ? `?${next.toString()}` : ''}`
  }

  const chipClass = (selected: boolean) =>
    'px-3 py-1.5 rounded-full text-sm border transition ' +
    (selected
      ? 'bg-brand text-white border-brand'
      : 'bg-white text-brand-text border-brand-border hover:bg-brand-bg-soft')

  return (
    <div className="flex gap-2">
      <Link href={hrefFor('all')} className={chipClass(active === 'all')}>
        Все
      </Link>
      <Link href={hrefFor('image')} className={chipClass(active === 'image')}>
        Изображения
      </Link>
    </div>
  )
}
