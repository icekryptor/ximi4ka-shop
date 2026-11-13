// Монетка-химикоин: кольцо и колба внутри. currentColor, без внешних файлов.
export function CoinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M6.8 4.5h2.4M7.4 4.5v2.6L5.6 10.6a.9.9 0 0 0 .8 1.4h3.2a.9.9 0 0 0 .8-1.4L8.6 7.1V4.5" />
    </svg>
  )
}
