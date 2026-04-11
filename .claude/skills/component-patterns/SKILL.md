---
name: component-patterns
description: "Shared UI component patterns for OurTable — reusable components, form patterns, animations, bottom sheets, skeleton loaders, filter chips. Use when working on: 'component', 'button', 'card', 'input', 'form', 'dialog', 'bottom sheet', 'skeleton', 'loading', 'animation', 'Framer Motion', 'dnd-kit', 'drag', 'autocomplete', 'speed dial', 'filter', 'chips', 'empty state', 'Radix'."
---

# Component Patterns

Recurring UI patterns across OurTable. Mobile-first, Tailwind CSS v4, Radix UI primitives, Framer Motion animations.

## Component Inventory

### `src/components/` (shared root)

| Component | Purpose |
|-----------|---------|
| `AutocompleteInput.tsx` | Text input with circle member suggestions + free-text. Used in chores and activities for assignment |
| `Button.tsx` | Styled button with variants |
| `Card.tsx` | Card wrapper with consistent padding/shadow |
| `EmptyState.tsx` | Empty state with icon + message + optional action |
| `Input.tsx` | Styled text input |
| `MonthCalendar.tsx` | Month view calendar for activities |
| `NotificationCenter.tsx` | Bell icon dropdown with activity reminders + chore nudges |
| `Skeleton.tsx` | Loading skeleton placeholders (replacing spinners) |
| `SpeedDial.tsx` | FAB with expandable action buttons (used in RecipesPage) |
| `UpgradePrompt.tsx` | `AIUpgradeModal` + `UsageMeter` — AI subscription gating |

### `src/components/layout/`

| Component | Purpose |
|-----------|---------|
| `AppShell.tsx` | Header + AI banner + Outlet + BottomNav, `max-w-lg mx-auto` |
| `BottomNav.tsx` | 5-tab bottom navigation with animated indicator |
| `Header.tsx` | App header with title + notification bell |

### `src/components/auth/`

| Component | Purpose |
|-----------|---------|
| `AuthGuard.tsx` | Auth check → spinner / LoginPage / OnboardingPage / children |

## Key Patterns

### Bottom Sheet / Dialog (Radix)
Used for create/edit forms throughout the app. Pattern:
```tsx
<Dialog.Root open={open} onOpenChange={setOpen}>
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
    <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl p-6 max-h-[85vh] overflow-y-auto">
      {/* Form content */}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

### Hub Page Tabs
Two patterns used:

**Pill tabs** (FoodHubPage):
```tsx
className={isActive ? 'bg-brand-500 text-white' : 'bg-muted text-muted-foreground'}
// Mix of inline render + navigation href
```

**Segmented control** (HouseholdHubPage):
```tsx
const [activeTab, setActiveTab] = useState<'chores' | 'activities'>('chores')
// Both tabs render inline
```

### Skeleton Loading
Replaced spinners on list pages. Pattern:
```tsx
if (isLoading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
```

### Filter Chips
Used in chores for assignee filtering. Pattern:
```tsx
<button className={cn('px-3 py-1 rounded-full text-sm', isActive ? 'bg-brand-500 text-white' : 'bg-muted')}>
  {label}
</button>
```

### AutocompleteInput
Circle member suggestions with free-text fallback:
```tsx
<AutocompleteInput
  value={assignee}
  onChange={setAssignee}
  suggestions={circleMembers.map(m => m.display_name)}
  placeholder={t('chores.assignee')}
/>
```

### Framer Motion Animations
- **Bottom nav indicator**: `layoutId="bottomNavIndicator"` for smooth tab switching
- **List items**: `<AnimatePresence>` with fade/slide for add/remove
- **Page transitions**: not used (instant mount via React Router)

### dnd-kit Drag and Drop
Used in shopping lists and store routes:
```tsx
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
    {items.map(item => <SortableItem key={item.id} {...item} />)}
  </SortableContext>
</DndContext>
```
Sensors: `PointerSensor` (distance: 8) + `TouchSensor` (delay: 200ms, tolerance: 5)

### Empty State
```tsx
<EmptyState
  icon={<ShoppingCart className="h-12 w-12" />}
  title={t('lists.empty')}
  description={t('lists.emptyDescription')}
  action={<Button onClick={handleCreate}>{t('lists.create')}</Button>}
/>
```

## Styling Conventions

- Mobile-first: base styles for mobile, `sm:` / `md:` for larger screens
- Brand color: `bg-brand-500` (#f97316 orange)
- Dark mode: `dark:` variants on key elements
- RTL: `rtl:` variants where directional (margins, padding, text-align)
- Max width: `max-w-lg mx-auto` on AppShell
- Icons: Lucide React (`lucide-react`)
