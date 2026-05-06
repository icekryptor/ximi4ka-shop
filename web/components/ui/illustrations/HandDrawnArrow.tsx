interface Props {
  className?: string
}

// Curve-up-right arrow, hand-drawn feel via slight wobble in the path.
// Origin near caption baseline, head pointing toward dashed rect center.
export function HandDrawnArrow({ className = '' }: Props) {
  return (
    <svg
      data-mark="hand-drawn-arrow"
      viewBox="0 0 60 40"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 35 C 18 32, 30 22, 42 12 C 44 11, 46 10, 48 10" />
      <path d="M48 10 L 43 8 M 48 10 L 46 14" />
    </svg>
  )
}
