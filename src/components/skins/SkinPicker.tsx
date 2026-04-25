import { SKINS, type Skin } from '@/lib/skins'
import { cn } from '@/lib/cn'

interface Props {
  selectedId: string
  onSelect: (id: string) => void
  className?: string
}

/**
 * Grid of all built-in skin cards. Each card renders in its own palette
 * so the user can preview the look before committing.
 */
export function SkinPicker({ selectedId, onSelect, className }: Props) {
  return (
    <div className={cn('grid grid-cols-2 gap-2.5', className)}>
      {SKINS.map((skin) => (
        <SkinCard
          key={skin.id}
          skin={skin}
          selected={selectedId === skin.id}
          onClick={() => onSelect(skin.id)}
        />
      ))}
    </div>
  )
}

function SkinCard({ skin, selected, onClick }: { skin: Skin; selected: boolean; onClick: () => void }) {
  const t = skin.tokens
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'text-start rounded-2xl p-3 transition-all active:scale-[0.98]',
        selected ? 'ring-2 ring-offset-2 ring-offset-rp-bg' : 'ring-1',
      )}
      style={{
        background: t.card,
        color: t.ink,
        // @ts-expect-error CSS custom property
        '--tw-ring-color': selected ? t.brand : t.hairline,
        fontFamily: skin.fonts?.sans ?? 'inherit',
        boxShadow: selected ? `0 0 0 2px ${t.brand}` : `0 0 0 1px ${t.hairline}`,
      }}
    >
      <div
        className="text-base font-semibold leading-tight"
        style={{
          fontFamily: skin.fonts?.display ?? 'inherit',
          fontStyle: skin.feel === 'sticker' ? 'italic' : 'normal',
          fontWeight: skin.feel === 'editorial' ? 400 : 600,
          letterSpacing: '-0.01em',
        }}
      >
        {skin.name}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: t.inkSoft }}>
        {skin.sub}
      </div>
      <div className="flex gap-1 mt-2">
        {[t.brand, t.accent, t.glow, t.cool].map((c, i) => (
          <span
            key={i}
            className="h-4 w-4 rounded-full"
            style={{ background: c, border: `1px solid ${t.hairline}` }}
          />
        ))}
      </div>
      <div
        className="text-[12px] mt-1.5 truncate"
        style={{ color: t.brandDeep, fontFamily: skin.fonts?.hand ?? "'Caveat', cursive" }}
      >
        {skin.tag}
      </div>
    </button>
  )
}
