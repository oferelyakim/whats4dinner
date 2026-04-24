import type { SVGProps } from 'react'

/** Hand-drawn style nav icons. Share stroke 1.6px, rounded caps. currentColor. */
const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export function HearthIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      {/* House with hearth inside */}
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5 10.5V20h14v-9.5" />
      <path d="M9 20v-5h6v5" />
      <path d="M11.2 16.5c0-.8.8-1 .8-1.8 0 .8.8 1 .8 1.8" />
    </svg>
  )
}

export function PotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      {/* Pot with steam curls */}
      <path d="M4.5 10h15" />
      <path d="M6 10v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7" />
      <path d="M3 11h1.5M19.5 11H21" />
      <path d="M9 6.5c0-1 1-1 1-2M13 6.5c0-1 1-1 1-2M17 6c0-.7.7-.8.7-1.6" />
    </svg>
  )
}

export function TableIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      {/* Oval gathering table, 3/4 perspective */}
      <ellipse cx="12" cy="11.5" rx="8" ry="3.2" />
      <path d="M6 14l-1 5M18 14l1 5" />
      <circle cx="7.5" cy="9" r="0.9" />
      <circle cx="12" cy="8.3" r="0.9" />
      <circle cx="16.5" cy="9" r="0.9" />
    </svg>
  )
}

export function HouseCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      {/* House outline with a circle nested inside */}
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5 10.5V20h14v-9.5" />
      <circle cx="12" cy="14.5" r="3.2" />
    </svg>
  )
}

export function PersonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      {/* Simple person bust */}
      <circle cx="12" cy="8.5" r="3.3" />
      <path d="M5.5 19.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
    </svg>
  )
}
