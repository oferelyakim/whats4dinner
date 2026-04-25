/**
 * Replanish skin system — named bundles of design tokens.
 * Layout, spacing, copy tone, iconography stay constant across skins.
 */

export type SkinTokens = {
  bg: string; bgSoft: string; bgDeep: string
  ink: string; inkSoft: string; inkMute: string
  hairline: string; card: string
  brand: string; brandSoft: string; brandDeep: string
  accent: string; accentSoft: string
  glow: string; glowSoft: string
  cool: string; coolSoft: string
}

export type SkinFonts = {
  display?: string
  sans?: string
  mono?: string
  hand?: string
}

export type SkinFeel =
  | 'editorial'
  | 'terminal'
  | 'pillow'
  | 'sticker'
  | 'default'

export type Skin = {
  id: string
  name: string
  sub: string
  tag: string
  tokens: SkinTokens
  dark?: boolean
  fonts?: SkinFonts
  feel?: SkinFeel
}

export const SKINS: Skin[] = [
  {
    id: 'hearth',
    name: 'Hearth',
    sub: 'warm homey',
    tag: 'a good day to be four',
    tokens: {
      bg: '#faf6ef', bgSoft: '#f2ece0', bgDeep: '#1f1612',
      ink: '#2a1f18', inkSoft: '#5c4a3e', inkMute: '#9a8878',
      hairline: 'rgba(42, 31, 24, 0.08)', card: '#ffffff',
      brand: '#c4522d', brandSoft: '#f2c9b4', brandDeep: '#8a2f1a',
      accent: '#6b7f56', accentSoft: '#d8deaf',
      glow: '#e8a84a', glowSoft: '#f9e3b8',
      cool: '#3e5970', coolSoft: '#c9d4df',
    },
  },
  {
    id: 'coastal',
    name: 'Coastal',
    sub: 'breezy california',
    tag: 'salt in the air',
    tokens: {
      bg: '#f4f1ec', bgSoft: '#e5ded2', bgDeep: '#102030',
      ink: '#1b2a36', inkSoft: '#4a5c6b', inkMute: '#8b9aa6',
      hairline: 'rgba(27,42,54,0.1)', card: '#ffffff',
      brand: '#c96a3a', brandSoft: '#f6cfb4', brandDeep: '#7a3418',
      accent: '#5a8a90', accentSoft: '#c9dcde',
      glow: '#eab94c', glowSoft: '#f6e2ad',
      cool: '#2f5a7a', coolSoft: '#c2d4e2',
    },
  },
  {
    id: 'ranch',
    name: 'Ranch',
    sub: 'hearty texas',
    tag: 'boots at the door',
    tokens: {
      bg: '#f5ede0', bgSoft: '#e5d6bb', bgDeep: '#201208',
      ink: '#2d1a0e', inkSoft: '#614432', inkMute: '#a38970',
      hairline: 'rgba(45,26,14,0.09)', card: '#ffffff',
      brand: '#b34418', brandSoft: '#f1c0a2', brandDeep: '#7a2808',
      accent: '#8a6b3a', accentSoft: '#e3cfa8',
      glow: '#e6a12a', glowSoft: '#f6dba1',
      cool: '#566a4a', coolSoft: '#cfd8b8',
    },
  },
  {
    id: 'pacific',
    name: 'Pacific',
    sub: 'misted pnw',
    tag: 'rain on cedar',
    tokens: {
      bg: '#eef2ec', bgSoft: '#d8e0dc', bgDeep: '#0f1a18',
      ink: '#1c2a28', inkSoft: '#4d605d', inkMute: '#8a9e99',
      hairline: 'rgba(28,42,40,0.09)', card: '#ffffff',
      brand: '#8a4b2d', brandSoft: '#e3c2a9', brandDeep: '#5a2c10',
      accent: '#476a62', accentSoft: '#bed2cc',
      glow: '#d4a24a', glowSoft: '#eed7a2',
      cool: '#446874', coolSoft: '#c0d0d8',
    },
  },
  {
    id: 'brooklyn',
    name: 'Brooklyn',
    sub: 'urban premium',
    tag: 'stoop season',
    tokens: {
      bg: '#f2eee6', bgSoft: '#ddd5c4', bgDeep: '#141210',
      ink: '#1e1c19', inkSoft: '#55504a', inkMute: '#8e887d',
      hairline: 'rgba(30,28,25,0.1)', card: '#ffffff',
      brand: '#8e2f1e', brandSoft: '#e3b8ab', brandDeep: '#561408',
      accent: '#6c5e42', accentSoft: '#d7caa6',
      glow: '#c39250', glowSoft: '#e9cda0',
      cool: '#3c4a52', coolSoft: '#bcc4c9',
    },
  },
  {
    id: 'tuscan',
    name: 'Tuscan',
    sub: 'rustic italian',
    tag: 'olive trees at dusk',
    tokens: {
      bg: '#f7eedd', bgSoft: '#ead8b6', bgDeep: '#1f1308',
      ink: '#2e1d0f', inkSoft: '#644530', inkMute: '#a68b6a',
      hairline: 'rgba(46,29,15,0.09)', card: '#ffffff',
      brand: '#a63221', brandSoft: '#eeb5a2', brandDeep: '#6d1a0c',
      accent: '#7a8a3c', accentSoft: '#d8dfa6',
      glow: '#e4a22a', glowSoft: '#f4d89a',
      cool: '#5a6a4a', coolSoft: '#ccd5b8',
    },
  },
  {
    id: 'meadow',
    name: 'Meadow',
    sub: 'sage & honey',
    tag: 'wild carrots',
    tokens: {
      bg: '#f4f6ea', bgSoft: '#e9edd8', bgDeep: '#1a2418',
      ink: '#1f2a1e', inkSoft: '#536150', inkMute: '#8fa089',
      hairline: 'rgba(31,42,30,0.1)', card: '#ffffff',
      brand: '#d6732a', brandSoft: '#f4d4b4', brandDeep: '#7a3a10',
      accent: '#4a7c59', accentSoft: '#c9ddd1',
      glow: '#dfa62d', glowSoft: '#f5e3b6',
      cool: '#4a6870', coolSoft: '#c9d8dc',
    },
  },
  {
    id: 'nordic',
    name: 'Nordic',
    sub: 'japandi minimalist',
    tag: 'soft as linen',
    feel: 'editorial',
    fonts: {
      display: "'EB Garamond', 'Times New Roman', serif",
      sans:    "'Inter Tight', -apple-system, system-ui, sans-serif",
      hand:    "'Caveat', cursive",
    },
    tokens: {
      bg: '#f3efe8', bgSoft: '#e6e0d4', bgDeep: '#1e2228',
      ink: '#1f242b', inkSoft: '#525a64', inkMute: '#8e96a0',
      hairline: 'rgba(31,36,43,0.10)', card: '#ffffff',
      brand: '#5a7088', brandSoft: '#cdd6e0', brandDeep: '#2e3f52',
      accent: '#7a8472', accentSoft: '#d4d8cc',
      glow:  '#c19a6b', glowSoft:  '#e8d8c2',
      cool:  '#3a4a5a', coolSoft:  '#c5cdd6',
    },
  },
  {
    id: 'bloom',
    name: 'Bloom',
    sub: 'soft botanical pastel',
    tag: 'a quiet little garden',
    feel: 'pillow',
    fonts: {
      display: "'Quicksand', 'Nunito', -apple-system, system-ui, sans-serif",
      sans:    "'Quicksand', 'Nunito', -apple-system, system-ui, sans-serif",
      hand:    "'Caveat', cursive",
    },
    tokens: {
      bg: '#fcf3ee', bgSoft: '#f5e3da', bgDeep: '#2b1a22',
      ink: '#2c1a22', inkSoft: '#6a4554', inkMute: '#a78694',
      hairline: 'rgba(44,26,34,0.09)', card: '#ffffff',
      brand: '#c4607a', brandSoft: '#f4cad5', brandDeep: '#7a2a40',
      accent: '#88a878', accentSoft: '#d6e2c8',
      glow:  '#e8b18a', glowSoft:  '#f6dcc7',
      cool:  '#8a93b8', coolSoft:  '#d6dae8',
    },
  },
  {
    id: 'citrus',
    name: 'Citrus',
    sub: 'retro pop',
    tag: "today's a juicy one",
    feel: 'sticker',
    fonts: {
      display: "'Fraunces', Georgia, serif",
      sans:    "'Inter', -apple-system, system-ui, sans-serif",
    },
    tokens: {
      bg: '#fff7e2', bgSoft: '#ffe9bf', bgDeep: '#0e1d3a',
      ink: '#0e1d3a', inkSoft: '#3d4d72', inkMute: '#7d8aa8',
      hairline: 'rgba(14,29,58,0.10)', card: '#ffffff',
      brand: '#e94e4a', brandSoft: '#ffc9c4', brandDeep: '#8a1a18',
      accent: '#3aa9c9', accentSoft: '#bfe2ec',
      glow:  '#5cc28b', glowSoft:  '#cfecda',
      cool:  '#1c3370', coolSoft:  '#c5cee0',
    },
  },
  {
    id: 'dusk',
    name: 'Dusk',
    sub: 'candlelit',
    tag: 'last light of the day',
    dark: true,
    tokens: {
      bg: '#1a1620', bgSoft: '#261f2e', bgDeep: '#0f0c14',
      ink: '#f4ebe0', inkSoft: '#bcaea0', inkMute: '#7d6e63',
      hairline: 'rgba(255,235,210,0.08)', card: '#241d2a',
      brand: '#e38466', brandSoft: '#6a3324', brandDeep: '#f2c9b4',
      accent: '#a8bb82', accentSoft: '#3a4a2d',
      glow: '#f0bf72', glowSoft: '#6a4a20',
      cool: '#7a95b2', coolSoft: '#2e3d4d',
    },
  },
  {
    id: 'studio',
    name: 'Studio',
    sub: 'cool monochrome dark',
    tag: 'late on the laptop',
    dark: true,
    feel: 'terminal',
    fonts: {
      display: "'JetBrains Mono', ui-monospace, monospace",
      sans:    "'JetBrains Mono', ui-monospace, monospace",
      mono:    "'JetBrains Mono', ui-monospace, monospace",
    },
    tokens: {
      bg: '#0e1116', bgSoft: '#161a22', bgDeep: '#070a0f',
      ink: '#e6edf5', inkSoft: '#9aa6b4', inkMute: '#5d6776',
      hairline: 'rgba(230,237,245,0.08)', card: '#181d26',
      brand: '#3ed7ee', brandSoft: '#103642', brandDeep: '#a8ecf6',
      accent: '#7c8896', accentSoft: '#202632',
      glow:  '#f5b94a', glowSoft:  '#3a2a10',
      cool:  '#5da4d4', coolSoft:  '#1c2a38',
    },
  },
  {
    id: 'night',
    name: 'Night Market',
    sub: 'festive',
    tag: 'paper lanterns',
    dark: true,
    tokens: {
      bg: '#160f1f', bgSoft: '#231835', bgDeep: '#080410',
      ink: '#f5e8d2', inkSoft: '#c4b195', inkMute: '#8a7760',
      hairline: 'rgba(245,232,210,0.09)', card: '#1e1430',
      brand: '#f06a4a', brandSoft: '#5a1e18', brandDeep: '#f9c5a8',
      accent: '#c5a04a', accentSoft: '#4a371a',
      glow: '#ffd25b', glowSoft: '#6b4a1a',
      cool: '#7fa0c0', coolSoft: '#2a3a52',
    },
  },
]

export const DEFAULT_SKIN_ID = 'hearth'

export function getSkin(id: string | null | undefined): Skin {
  if (!id) return SKINS[0]
  return SKINS.find((s) => s.id === id) ?? SKINS[0]
}

/**
 * Resolve the active skin — prefer explicit custom_skin JSON if present,
 * otherwise look up by id. Falls back to Hearth.
 */
export function resolveSkin(
  skinId?: string | null,
  custom?: Partial<Skin> | null,
): Skin {
  if (skinId === 'custom' && custom?.tokens) {
    return {
      id: 'custom',
      name: custom.name ?? 'Custom',
      sub: custom.sub ?? 'yours',
      tag: custom.tag ?? '',
      tokens: custom.tokens as SkinTokens,
      dark: custom.dark,
      fonts: custom.fonts,
      feel: custom.feel,
    }
  }
  return getSkin(skinId)
}

/** Suggest a skin id based on a circle_type. */
export function suggestSkinId(circleType?: string | null): string {
  switch (circleType) {
    case 'event': return 'citrus'
    case 'roommates': return 'nordic'
    case 'friends': return 'bloom'
    case 'family': return 'hearth'
    default: return 'hearth'
  }
}

const HEARTH_FONTS: Required<SkinFonts> = {
  display: "'Instrument Serif', 'Times New Roman', serif",
  sans:    "'Geist', -apple-system, system-ui, sans-serif",
  mono:    "ui-monospace, 'SF Mono', Menlo, monospace",
  hand:    "'Caveat', cursive",
}

/** Convert camelCase token name to kebab-case CSS var suffix. */
function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

/** Write a skin's tokens to `document.documentElement` as --rp-* CSS vars. */
export function applySkin(skin: Skin, root: HTMLElement = document.documentElement): void {
  // 1. Color tokens
  Object.entries(skin.tokens).forEach(([k, v]) => {
    root.style.setProperty(`--rp-${kebab(k)}`, v)
  })

  // 2. Font stacks (skin overrides → Hearth fallback)
  const f = { ...HEARTH_FONTS, ...(skin.fonts ?? {}) }
  root.style.setProperty('--rp-ff-display', f.display)
  root.style.setProperty('--rp-ff-sans',    f.sans)
  root.style.setProperty('--rp-ff-mono',    f.mono)
  root.style.setProperty('--rp-ff-hand',    f.hand)

  // 3. Dark mode + structural feel
  root.classList.toggle('dark', !!skin.dark)
  if (skin.feel && skin.feel !== 'default') {
    root.dataset.feel = skin.feel
  } else {
    delete root.dataset.feel
  }
}
