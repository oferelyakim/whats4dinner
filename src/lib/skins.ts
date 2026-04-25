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
  | 'magazine'
  | 'lantern'
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
  // ─── 1. HEARTH — warm cream + ember (default family skin) ──────────────
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

  // ─── 2. CITRUS — retro pop, juicy, sticker shapes ───────────────────────
  {
    id: 'citrus',
    name: 'Citrus',
    sub: 'retro pop',
    tag: "today's a juicy one",
    feel: 'sticker',
    fonts: {
      display: "'Fraunces', Georgia, serif",
      sans:    "'Inter', -apple-system, system-ui, sans-serif",
      hand:    "'Patrick Hand', cursive",
    },
    tokens: {
      bg: '#fff4d6', bgSoft: '#ffe6a8', bgDeep: '#0e1d3a',
      ink: '#0e1d3a', inkSoft: '#3d4d72', inkMute: '#7d8aa8',
      hairline: 'rgba(14, 29, 58, 0.14)', card: '#ffffff',
      brand: '#ee443f', brandSoft: '#ffc6c2', brandDeep: '#8a1a18',
      accent: '#3aa9c9', accentSoft: '#bfe2ec',
      glow: '#5cc28b', glowSoft: '#cfecda',
      cool: '#1c3370', coolSoft: '#c5cee0',
    },
  },

  // ─── 3. BROOKLYN — editorial premium, slab, magazine rules ──────────────
  {
    id: 'brooklyn',
    name: 'Brooklyn',
    sub: 'urban editorial',
    tag: 'stoop season',
    feel: 'magazine',
    fonts: {
      display: "'Domine', Georgia, serif",
      sans:    "'DM Sans', -apple-system, system-ui, sans-serif",
      hand:    "'Caveat', cursive",
    },
    tokens: {
      bg: '#ebe5d6', bgSoft: '#dcd3bd', bgDeep: '#141210',
      ink: '#1a1814', inkSoft: '#4a463e', inkMute: '#7e786d',
      hairline: 'rgba(26, 24, 20, 0.18)', card: '#f6f1e2',
      brand: '#6b1d18', brandSoft: '#d8b8b3', brandDeep: '#3a0c08',
      accent: '#3a3a36', accentSoft: '#c4c0b6',
      glow: '#b8862e', glowSoft: '#e3d0a4',
      cool: '#2c3a3d', coolSoft: '#aeb8b8',
    },
  },

  // ─── 4. MEADOW — pillowy botanical, rounded everywhere ──────────────────
  {
    id: 'meadow',
    name: 'Meadow',
    sub: 'sage & honey',
    tag: 'wild carrots & warm bread',
    feel: 'pillow',
    fonts: {
      display: "'Quicksand', -apple-system, system-ui, sans-serif",
      sans:    "'Quicksand', -apple-system, system-ui, sans-serif",
      hand:    "'Caveat', cursive",
    },
    tokens: {
      bg: '#eef2dd', bgSoft: '#dde5c2', bgDeep: '#1a2418',
      ink: '#2a3a26', inkSoft: '#566350', inkMute: '#8ea088',
      hairline: 'rgba(42, 58, 38, 0.10)', card: '#fbfcf2',
      brand: '#5e8a4a', brandSoft: '#cee0b8', brandDeep: '#2f5024',
      accent: '#c46a48', accentSoft: '#f0cab6',
      glow: '#e6b04a', glowSoft: '#f5e0a8',
      cool: '#4a6f7a', coolSoft: '#bcd2d8',
    },
  },

  // ─── 5. STUDIO — terminal, mono, dark + cyan ────────────────────────────
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
      hairline: 'rgba(230, 237, 245, 0.10)', card: '#181d26',
      brand: '#3ed7ee', brandSoft: '#103642', brandDeep: '#a8ecf6',
      accent: '#7c8896', accentSoft: '#202632',
      glow: '#f5b94a', glowSoft: '#3a2a10',
      cool: '#5da4d4', coolSoft: '#1c2a38',
    },
  },

  // ─── 6. NIGHT MARKET — theatrical warm-dark, plum + lantern ─────────────
  {
    id: 'night',
    name: 'Night Market',
    sub: 'festive theatrical',
    tag: 'paper lanterns & woodsmoke',
    dark: true,
    feel: 'lantern',
    fonts: {
      display: "'Cormorant Garamond', 'Times New Roman', serif",
      sans:    "'Inter', -apple-system, system-ui, sans-serif",
      hand:    "'Caveat', cursive",
    },
    tokens: {
      bg: '#1c1228', bgSoft: '#2a1c3c', bgDeep: '#0a0612',
      ink: '#f7eedc', inkSoft: '#d2bda0', inkMute: '#8a7866',
      hairline: 'rgba(247, 238, 220, 0.12)', card: '#26193a',
      brand: '#f4884a', brandSoft: '#5a2a18', brandDeep: '#fbc6a4',
      accent: '#5cb78a', accentSoft: '#1f3d30',
      glow: '#ffd25b', glowSoft: '#5a3e10',
      cool: '#a07ec8', coolSoft: '#3a2a52',
    },
  },
]

export const DEFAULT_SKIN_ID = 'hearth'

// ─── Legacy id remap — keeps existing rows from breaking ──────────────────
// Used by getSkin() when an unknown / retired id is encountered.
const LEGACY_SKIN_REMAP: Record<string, string> = {
  coastal: 'hearth',
  ranch:   'hearth',
  pacific: 'meadow',
  tuscan:  'hearth',
  nordic:  'brooklyn',
  bloom:   'meadow',
  dusk:    'night',
}

export function getSkin(id: string | null | undefined): Skin {
  if (!id) return SKINS[0]
  const remapped = LEGACY_SKIN_REMAP[id] ?? id
  return SKINS.find((s) => s.id === remapped) ?? SKINS[0]
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
    case 'event':     return 'citrus'
    case 'roommates': return 'studio'
    case 'friends':   return 'meadow'
    case 'family':    return 'hearth'
    default:          return 'hearth'
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
