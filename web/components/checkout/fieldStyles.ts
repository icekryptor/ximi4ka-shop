// Классы полей чекаута: страница и поля доставки выглядят одинаково.
export const FIELD_CLASS =
  'w-full px-4 py-3 bg-transparent border border-[var(--color-lj-rule)] rounded-none font-lj-body text-base text-[var(--color-lj-ink)] placeholder:opacity-40 focus:outline-none focus:border-[var(--color-lj-ink)] transition-colors'

export const LABEL_CLASS =
  'font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)] opacity-70'

export const ERROR_CLASS =
  'font-lj-mono text-[length:var(--text-lj-mono-xs)] tracking-[0.04em] text-[var(--color-stock-danger)]'

// Приглушённая подпись: подсказки, статусы, часы работы пункта.
export const HINT_CLASS =
  'm-0 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-60'

// Выпадающий список полей «Город» и «Пункт получения».
export const LISTBOX_CLASS =
  'absolute left-0 right-0 top-[calc(100%+0.25rem)] z-[60] m-0 max-h-[min(60vh,24rem)] list-none overflow-y-auto border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream)] p-1 shadow-[var(--shadow-lj-bright)]'

export function optionClass(active: boolean): string {
  return `flex cursor-pointer flex-col gap-0.5 px-3 py-2 font-lj-body text-base text-[var(--color-lj-ink)] ${
    active ? 'bg-[var(--color-lj-cream-shade)]' : 'hover:bg-[var(--color-lj-cream-shade)]'
  }`
}
