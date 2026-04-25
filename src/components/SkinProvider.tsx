import { useEffect, type ReactNode } from 'react'
import { applySkin, resolveSkin } from '@/lib/skins'
import { useAppStore } from '@/stores/appStore'
import type { Skin } from '@/lib/skins'

/**
 * Reads the active circle's skin_id (+ optional custom_skin) and writes
 * matching --rp-* CSS variables onto <html>. All rp-* Tailwind utilities
 * resolve through these vars, so swapping a skin is a single writeback.
 *
 * The skin is the ONLY authority on the `.dark` class. Theme preference
 * (light/dark/system) is retained for future per-skin variants but does
 * NOT toggle `.dark` — otherwise legacy `dark:bg-surface-dark-*` utilities
 * fight the skin's inline `--rp-*` values and produce unreadable surfaces.
 * Light-only skins (e.g. Hearth) therefore render consistently regardless
 * of OS preference.
 *
 * Falls back to Hearth when no circle is loaded.
 */
export function SkinProvider({ children }: { children: ReactNode }) {
  const activeCircle = useAppStore((s) => s.activeCircle)

  const skin: Skin = resolveSkin(
    activeCircle?.skin_id,
    activeCircle?.custom_skin as Partial<Skin> | null | undefined,
  )

  useEffect(() => {
    applySkin(skin)
  }, [skin])

  return <>{children}</>
}
