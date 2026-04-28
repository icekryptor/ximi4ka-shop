interface Props {
  characteristics: Record<string, string>
  className?: string
}

const MIN_KEYS_TO_RENDER = 4

/**
 * Comprehensive product characteristics table. Only renders when there are
 * at least 4 entries — below that, the KeyFactsList already covers things.
 */
export function CharacteristicsTable({ characteristics, className = '' }: Props) {
  const entries = Object.entries(characteristics)
  if (entries.length < MIN_KEYS_TO_RENDER) return null

  return (
    <table className={`w-full border-collapse ${className}`}>
      <tbody>
        {entries.map(([key, value]) => (
          <tr
            key={key}
            className="border-b border-[var(--color-border-subtle)] last:border-b-0"
          >
            <th
              scope="row"
              className="py-3 pr-6 text-left align-top text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)]"
            >
              {key}
            </th>
            <td className="py-3 text-left align-top text-[length:var(--text-body)] text-[var(--color-brand-text)]">
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
