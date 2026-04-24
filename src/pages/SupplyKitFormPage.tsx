import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2, Package } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { UNITS, type Unit } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'
import { createRecipe, getIngredientSuggestions } from '@/services/recipes'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'

const KIT_CATEGORIES = ['Bathroom', 'Kitchen', 'Cleaning', 'Laundry', 'Office', 'School', 'Baby', 'Pet', 'Party', 'Seasonal', 'Other']

interface ItemRow {
  id: string
  name: string
  quantity: string
  unit: Unit
  notes: string
}

let nextId = 1

export function SupplyKitFormPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeCircle } = useAppStore()
  const { t, locale } = useI18n()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kitCategory, setKitCategory] = useState('Other')
  const [items, setItems] = useState<ItemRow[]>([])
  const [saveError, setSaveError] = useState('')
  const itemsEndRef = useRef<HTMLDivElement>(null)

  const { data: ingredientSuggestions = [] } = useQuery({
    queryKey: ['ingredient-suggestions', locale],
    queryFn: () => getIngredientSuggestions(locale),
  })

  function addItem() {
    setItems((prev) => [...prev, { id: `item-${nextId++}`, name: '', quantity: '', unit: '' as Unit, notes: '' }])
    setTimeout(() => itemsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
  }

  function updateItem(rowId: string, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((item) => (item.id === rowId ? { ...item, [field]: value } : item)))
  }

  function removeItem(rowId: string) {
    setItems((prev) => prev.filter((item) => item.id !== rowId))
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      createRecipe({
        type: 'supply_kit',
        title: title.trim(),
        description: description.trim() || undefined,
        kit_category: kitCategory,
        circle_id: activeCircle?.id,
        ingredients: items
          .filter((item) => item.name.trim())
          .map((item) => ({
            name: item.name.trim(),
            quantity: item.quantity ? parseFloat(item.quantity) : null,
            unit: item.unit,
            sort_order: 0,
            notes: item.notes || null,
            item_id: null,
          })),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['recipes'] })
      navigate('/recipes?view=essentials')
    },
    onError: (err: Error) => setSaveError(err.message),
  })

  return (
    <div className="px-4 sm:px-6 py-4 space-y-5 animate-page-enter">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-11 w-11 rounded-xl flex items-center justify-center bg-rp-bg-soft active:scale-90 transition-transform"
        >
          <ArrowLeft className="h-5 w-5 text-rp-ink-soft rtl-flip" />
        </button>
        <Package className="h-5 w-5 text-brand-500" />
        <h2 className="font-display italic tracking-rp-tight text-[26px] text-rp-ink">{t('essentials.newEssentials')}</h2>
      </div>

      {/* Basic Info */}
      <div className="space-y-3">
        <Input
          label={t('essentials.name')}
          placeholder="e.g., Bathroom Restock, Party Supplies"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
          required
        />
        <Input
          label="Description (optional)"
          placeholder="Quick note about this kit"
          value={description}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
        />

        {/* Category */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-rp-ink-soft">Category</label>
          <div className="flex gap-1.5 flex-wrap">
            {KIT_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setKitCategory(cat)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  kitCategory === cat ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-surface-dark-overlay text-rp-ink-soft'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Items */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-rp-ink">Items</h3>
          <Button size="sm" variant="ghost" onClick={addItem}>
            <Plus className="h-4 w-4" />
            {t('common.add')}
          </Button>
        </div>

        {items.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-slate-400 text-center">No items yet. Tap "Add" to start.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <Card key={item.id} className="p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <AutocompleteInput
                      placeholder="Item name (e.g., Toilet paper)"
                      value={item.name}
                      onChange={(val) => updateItem(item.id, 'name', val)}
                      suggestions={ingredientSuggestions}
                    />
                    <div className="flex gap-2">
                      <input
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                        className="w-16 text-sm bg-transparent border-b border-rp-hairline pb-1 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                      />
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                        className="text-sm border-b border-rp-hairline pb-1 text-slate-900 dark:text-slate-100 bg-rp-card rounded focus:outline-none focus:border-brand-500"
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>{u || 'Unit'}</option>
                        ))}
                      </select>
                      <input
                        placeholder="Notes"
                        value={item.notes}
                        onChange={(e) => updateItem(item.id, 'notes', e.target.value)}
                        className="flex-1 text-sm bg-transparent border-b border-rp-hairline pb-1 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    aria-label="Remove item"
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            ))}
            <div ref={itemsEndRef} />
          </div>
        )}
      </section>

      {saveError && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{saveError}</p>
      )}

      {/* Save */}
      <div className="flex gap-3 pt-2 pb-4">
        <Button variant="secondary" className="flex-1" onClick={() => navigate(-1)}>
          {t('common.cancel')}
        </Button>
        <Button className="flex-1" onClick={() => saveMutation.mutate()} disabled={!title.trim() || saveMutation.isPending}>
          {saveMutation.isPending ? t('common.loading') : t('essentials.save')}
        </Button>
      </div>
    </div>
  )
}
