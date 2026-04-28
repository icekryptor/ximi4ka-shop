interface Props {
  section: string
  label: string
  page: number
  total: number
  edition?: string
}

// Outer element is <div> (not <header>): NotebookHeader is positioned absolute
// inside a LabSection — it's a "section coordinates bar," not the start of a
// sectioning context. Using <div> keeps semantics honest.
export function NotebookHeader({ section, label, page, total, edition }: Props) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <div className="absolute top-5 left-6 right-6 z-[5] flex items-center justify-between font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em]">
      <div className="flex items-center gap-3">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-lj-brand)]" />
        <span>№ {section} — {label}</span>
      </div>
      <div className="flex gap-7">
        {edition && <span>{edition}</span>}
        <span>стр. {pad(page)} / {pad(total)}</span>
      </div>
    </div>
  )
}
