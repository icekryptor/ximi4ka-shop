interface Props {
  align?: 'left' | 'right'
  surface?: 'cream' | 'ink'
}

// Asymmetric horizontal rule used as a section-edge accent inside <LabSection>.
// Default left-aligned at 38% width; right variant tucks 22% to the trailing edge.
// Relies on a `position: relative` parent (LabSection provides this baseline)
// since the rule pins to bottom: 0 of its container.
export function RuleAsym({ align = 'left', surface = 'cream' }: Props) {
  const width = align === 'right' ? '22%' : '38%'
  const positionStyle = align === 'right' ? { right: '0px' } : { left: '0px' }
  const background = surface === 'ink' ? 'var(--color-lj-rule-on-ink)' : 'var(--color-lj-rule)'
  return (
    <div
      aria-hidden="true"
      className="absolute bottom-0 h-px"
      style={{ width, ...positionStyle, background }}
    />
  )
}
