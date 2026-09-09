export default function LanternIcon({ state = 'idle', className = '', size = 96 }) {
  const active = state === 'active'
  const done = state === 'done'
  const tone = done ? 'var(--po-state-done)' : active ? 'var(--po-state-active)' : 'var(--po-state-idle)'

  return (
    <svg
      className={`lantern-icon lantern-${state}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path d="M16 2.6v2.6M12.4 5.2h7.2" stroke={tone} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10.6 8.6h10.8l1.6 3.6H9z" fill={active || done ? tone : 'none'} stroke={tone} strokeWidth="1.5" />
      <path
        d="M10.2 12.2h11.6l.9 13.4H9.3z"
        fill={active || done ? `color-mix(in srgb, ${tone} 22%, transparent)` : 'none'}
        stroke={tone}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {done ? (
        <path d="M12.6 19.2l2.4 2.4 4.6-4.8" stroke={tone} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path
          d="M16 15.4c2.1 2.1 3.1 3.4 3.1 5.2a3.1 3.1 0 0 1-6.2 0c0-1.8 1-3.1 3.1-5.2z"
          fill={active ? 'var(--po-state-active)' : 'none'}
          stroke={active ? 'none' : tone}
          strokeWidth="1.3"
        />
      )}
      <path d="M12.2 25.6h7.6l.7 3.2h-9z" fill={active || done ? tone : 'none'} stroke={tone} strokeWidth="1.4" />
    </svg>
  )
}
