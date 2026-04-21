'use client'

import { useId } from 'react'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
} from '@/lib/i18n'

export interface LocaleTabCompleteness {
  /** Number of fields that are "considered filled" for this locale. */
  filled: number
  /** Total number of fields tracked for completeness. */
  total: number
}

interface Props {
  active: Locale
  onChange: (next: Locale) => void
  /**
   * Per-locale completeness stats. Default locale is treated as always
   * complete (its values are required entity columns), so RU can be
   * omitted — we'll show a check mark regardless.
   */
  completeness?: Partial<Record<Locale, LocaleTabCompleteness>>
  /** Optional human labels, e.g. { ru: 'Русский', en: 'English' }. */
  labels?: Partial<Record<Locale, string>>
}

const DEFAULT_LABELS: Record<Locale, string> = {
  ru: 'RU',
  en: 'EN',
}

function isComplete(stats: LocaleTabCompleteness | undefined): boolean {
  if (!stats) return false
  return stats.total > 0 && stats.filled === stats.total
}

function badgeFor(
  locale: Locale,
  stats: LocaleTabCompleteness | undefined,
): string {
  // Default locale is always "complete" from the admin's POV — its
  // values are required top-level columns, not optional JSON fields.
  if (locale === DEFAULT_LOCALE) return '✓'
  if (!stats || stats.total === 0) return '·'
  if (stats.filled === 0) return '·'
  if (isComplete(stats)) return '✓'
  return `${stats.filled}/${stats.total}`
}

/**
 * Tab switcher for multi-language entity editing. Rendered above the
 * fields so admins can flip between RU (top-level columns) and EN
 * (under `translations.en`) without losing unsaved changes in either
 * tab — parent keeps the state.
 *
 * The completeness badge is a lightweight hint, not validation:
 *   ✓ = all tracked fields filled
 *   · = none filled
 *   N/M = partial
 *
 * For RU we render ✓ unconditionally because its values are required
 * columns the form already enforces.
 */
export function LanguageTabs({ active, onChange, completeness, labels }: Props) {
  const listId = useId()
  return (
    <div
      role="tablist"
      aria-label="Язык перевода"
      id={listId}
      className="inline-flex items-center gap-1 rounded-full bg-brand-bg-soft p-1"
    >
      {SUPPORTED_LOCALES.map((loc) => {
        const selected = loc === active
        const label = labels?.[loc] ?? DEFAULT_LABELS[loc]
        const stats = completeness?.[loc]
        const badge = badgeFor(loc, stats)
        return (
          <button
            key={loc}
            type="button"
            role="tab"
            aria-selected={selected}
            data-locale={loc}
            onClick={() => onChange(loc)}
            className={
              selected
                ? 'px-4 py-1.5 rounded-full bg-white text-brand-text text-sm font-semibold shadow-sm'
                : 'px-4 py-1.5 rounded-full text-brand-text-secondary text-sm hover:text-brand-text'
            }
          >
            <span>{label}</span>
            <span
              aria-label={
                isComplete(stats) || loc === DEFAULT_LOCALE
                  ? 'Заполнено'
                  : stats && stats.filled > 0
                    ? `Заполнено ${stats.filled} из ${stats.total}`
                    : 'Не заполнено'
              }
              className="ml-2 text-xs opacity-70"
            >
              {badge}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Count how many of the given values are "filled" (non-empty string,
 * non-null). Utility used by the three admin forms to build a
 * completeness stat for the EN tab.
 */
export function countFilled(values: Array<unknown>): number {
  return values.reduce<number>((acc, v) => {
    if (v == null) return acc
    if (typeof v === 'string' && v.trim() === '') return acc
    return acc + 1
  }, 0)
}
