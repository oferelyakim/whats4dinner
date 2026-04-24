import { Avatar } from './Avatar'

export interface CircleGlyphProps {
  members: string[]
  centerLabel?: string
  size?: number
}

/**
 * Concentric ring of avatars around a glowing center.
 * The signature brand visual — onboarding, circle page, ad hero.
 */
export function CircleGlyph({ members, centerLabel = 'home', size = 220 }: CircleGlyphProps) {
  const radius = size * 0.38
  const count = Math.max(members.length, 1)
  const center = size / 2

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label={`Circle of ${members.length} members`}
    >
      <svg width={size} height={size} className="absolute inset-0" aria-hidden="true">
        {[1, 0.72, 0.5, 0.3].map((r, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius * r + 10}
            fill="none"
            stroke="var(--rp-hairline)"
            strokeWidth={1}
          />
        ))}
        <circle cx={center} cy={center} r={radius * 0.22} fill="var(--rp-glow-soft)" />
        <circle cx={center} cy={center} r={radius * 0.14} fill="var(--rp-glow)" opacity={0.85} />
      </svg>
      <span
        className="absolute font-hand text-lg"
        style={{
          left: center,
          top: center,
          transform: 'translate(-50%, -50%)',
          color: 'var(--rp-brand-deep)',
        }}
      >
        {centerLabel}
      </span>
      {members.map((name, i) => {
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2
        const x = center + Math.cos(angle) * radius
        const y = center + Math.sin(angle) * radius
        return (
          <div
            key={`${name}-${i}`}
            className="absolute"
            style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
          >
            <Avatar name={name} size="md" ring="bg" />
          </div>
        )
      })}
    </div>
  )
}
