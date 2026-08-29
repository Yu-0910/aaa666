type BaseballFieldProps = {
  className?: string
}

export function BaseballField({ className = "" }: BaseballFieldProps) {
  return (
    <svg
      viewBox="0 0 100 120"
      aria-hidden="true"
      className={className}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="field-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f6b39" />
          <stop offset="100%" stopColor="#0c2d18" />
        </linearGradient>
        <linearGradient id="outfield-grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#115f31" />
          <stop offset="100%" stopColor="#083d1f" />
        </linearGradient>
        <linearGradient id="infield-dirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9f6420" />
          <stop offset="100%" stopColor="#714114" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="100" height="120" rx="6" fill="url(#field-bg)" />

      <path
        d="M12 106C18 73 31 42 50 18C69 42 82 73 88 106L50 118Z"
        fill="url(#outfield-grass)"
      />

      <path
        d="M28 112C32 91 40 74 50 62C60 74 68 91 72 112L50 120Z"
        fill="#0f5b31"
      />

      <path
        d="M19 108L50 77L81 108L72 117L50 95L28 117Z"
        fill="url(#infield-dirt)"
      />

      <path d="M35 100L50 85L65 100L50 115Z" fill="#114825" />

      <circle cx="50" cy="104" r="4.3" fill="#8b5319" />
      <circle cx="50" cy="104" r="1.25" fill="#f7f1df" opacity="0.8" />

      <path
        d="M50 77L19 108M50 77L81 108M50 77L23 112M50 77L77 112"
        stroke="#f6f0dc"
        strokeWidth="0.65"
        strokeLinecap="round"
        opacity="0.95"
      />

      <path
        d="M19 108C28 74 38 58 50 49C62 58 72 74 81 108"
        fill="none"
        stroke="#d9c197"
        strokeWidth="0.7"
        opacity="0.85"
      />

      <rect
        x="48.65"
        y="83.65"
        width="2.7"
        height="2.7"
        rx="0.25"
        transform="rotate(45 50 85)"
        fill="#f7f1df"
      />
      <rect
        x="33.65"
        y="98.65"
        width="2.7"
        height="2.7"
        rx="0.25"
        transform="rotate(45 35 100)"
        fill="#f7f1df"
      />
      <rect
        x="63.65"
        y="98.65"
        width="2.7"
        height="2.7"
        rx="0.25"
        transform="rotate(45 65 100)"
        fill="#f7f1df"
      />
      <rect
        x="48.65"
        y="113.65"
        width="2.7"
        height="2.7"
        rx="0.25"
        transform="rotate(45 50 115)"
        fill="#f7f1df"
      />

      <rect x="47.3" y="103.45" width="5.4" height="1.1" rx="0.55" fill="#f7f1df" />
    </svg>
  )
}
