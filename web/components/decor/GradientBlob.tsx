import { useId } from 'react'

interface Props {
  className?: string
}

export function GradientBlob({ className = '' }: Props) {
  const gradientId = useId()

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 600 600"
      width="100%"
      height="100%"
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgb(141, 103, 255)" stopOpacity="1" />
          <stop offset="100%" stopColor="rgb(200, 86, 255)" stopOpacity="1" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M448.5,322.5Q418,395,343.5,433Q269,471,182,448Q95,425,68.5,344.5Q42,264,80,184Q118,104,206,72.5Q294,41,366.5,93.5Q439,146,463.5,223Q488,250,448.5,322.5Z"
      />
    </svg>
  )
}
