import { useEffect, type ReactNode } from 'react'
import { applySkin, resolveSkin } from '@/lib/skins'
import { useAppStore } from '@/stores/appStore'
import type { Skin } from '@/lib/skins'

/**
 * Resolves the active skin in this priority order:
 *   1. personalSkinId (per-device override, persisted in zustand)
 *   2. activeCircle.skin_id (+ custom_skin)
 *   3. Hearth fallback
 *
 * Writes --rp-* / --rp-ff-* CSS vars + `data-feel` onto <html>.
 *
 * The skin is the ONLY authority on the `.dark` class. Theme preference
 * (light/dark/system) is retained for future per-skin variants but does
 * NOT toggle `.dark` — otherwise legacy `dark:bg-surface-dark-*` utilities
 * fight the skin's inline `--rp-*` values and produce unreadable surfaces.
 */
export function SkinProvider({ children }: { children: ReactNode }) {
  const activeCircle = useAppStore((s) => s.activeCircle)
  const personalSkinId = useAppStore((s) => s.personalSkinId)

  const skin: Skin = personalSkinId
    ? resolveSkin(personalSkinId, null)
    : resolveSkin(
        activeCircle?.skin_id,
        activeCircle?.custom_skin as Partial<Skin> | null | undefined,
      )

  useEffect(() => {
    applySkin(skin)
  }, [skin])

  return <>{children}</>
}
