interface Props {
  title: string
  todo?: string
}

// Stand-in panel for admin pages that aren't wired up yet. Each later 3.x
// task replaces one of these with a real implementation.
export function AdminPlaceholder({ title, todo }: Props) {
  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold text-brand-text mb-4">{title}</h1>
      <div className="bg-white border border-brand-border rounded-2xl p-6">
        <p className="text-brand-text-secondary">
          Раздел в разработке. Появится в одной из следующих задач фазы 3.
        </p>
        {todo ? (
          <p className="mt-3 text-xs text-brand-text-secondary/70">TODO: {todo}</p>
        ) : null}
      </div>
    </div>
  )
}
