import { useEffect, type ReactNode } from 'react'
import { applySkin, resolveSkin } from '@/lib/skins'
import { useAppStore } from '@/stores/appStore'
import type { Skin } from '@/lib/skins'

/**
 * Reads the active circle's skin_id (+ optional custom_skin) and writes
 * matching --rp-* CSS variables onto <html>. All rp-* Tailwind utilities
 * resolve through these vars, so swapping a skin is a single writeback.
 *
 * Falls back to Hearth when no circle is loaded.
 */
export function SkinProvider({ children }: { children: ReactNode }) {
  const activeCircle = useAppStore((s) => s.activeCircle)
  const theme = useAppStore((s) => s.theme)

  const skin: Skin = resolveSkin(
    activeCircle?.skin_id,
    activeCircle?.custom_skin as Partial<Skin> | null | undefined,
  )

  useEffect(() => {
    applySkin(skin)
    // If the user's explicit theme preference is 'light', force-clear any dark
    // class the skin may have set. 'dark' and 'system' let the skin's own
    // `dark` flag drive the class.
    if (theme === 'light') {
      document.documentElement.classList.remove('dark')
    } else if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    }
  }, [skin, theme])

  return <>{children}</>
}
