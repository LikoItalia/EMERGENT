export function ContextLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="cl" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9d75ff" />
          <stop offset="1" stopColor="#7c50ff" />
        </linearGradient>
      </defs>
      <path
        d="M44 16 a18 18 0 1 0 0 32"
        stroke="url(#cl)"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
