# UI Conventions

## Form Patterns

Forms are typically in Radix Dialog bottom sheets. Structure:
1. State: local `useState` for each field
2. Submit: mutation via TanStack Query `useMutation`
3. Reset: clear state on `onOpenChange(false)`
4. Validation: inline checks before submit, no form library

```tsx
const [name, setName] = useState('')
const mutation = useMutation({ mutationFn: createItem, onSuccess: () => { setOpen(false); queryClient.invalidateQueries(...) } })
const handleSubmit = () => { if (!name.trim()) return; mutation.mutate({ name }) }
```

## Card Pattern

Cards use consistent styling:
```tsx
<div className="bg-card rounded-lg p-4 shadow-sm border border-border">
  {/* content */}
</div>
```

## List Item Pattern

Tappable list items with chevron:
```tsx
<Link to={`/items/${item.id}`} className="flex items-center justify-between p-4 bg-card rounded-lg border border-border">
  <div>{item.name}</div>
  <ChevronRight className="h-5 w-5 text-muted-foreground rtl:rotate-180" />
</Link>
```
Note the `rtl:rotate-180` on directional icons.

## Error Handling in UI

- Mutations: `onError` shows toast or inline error message
- Queries: `isError` renders error state with retry button
- No global error boundary (each page handles its own errors)

## Color Semantics

| Usage | Class |
|-------|-------|
| Primary action | `bg-brand-500 text-white` |
| Destructive | `bg-red-500 text-white` |
| Muted/secondary | `bg-muted text-muted-foreground` |
| Success indicator | `text-green-500` |
| Warning indicator | `text-orange-500` |
| Card background | `bg-card` |
| Page background | `bg-background` |
| Borders | `border-border` |

## Animation Conventions

- **Skeleton loaders**: CSS `animate-pulse` via Tailwind
- **Spinners**: `animate-spin` on a border element (`border-brand-500 border-t-transparent`)
- **List transitions**: Framer Motion `AnimatePresence` + `motion.div` with `initial/animate/exit`
- **Bottom nav**: Framer Motion `layoutId` for shared element transition
- **No page transitions**: pages mount instantly (no route animation)

## i18n in Components

All user-facing text goes through `useTranslation()`:
```tsx
const { t } = useTranslation()
// ...
<Button>{t('common.save')}</Button>
```
Never hardcode text strings in components.

## Responsive Breakpoints

Mobile-first. Most components don't need breakpoints (app is `max-w-lg`).
When used: `sm:` (640px), `md:` (768px) — primarily for padding/spacing adjustments.
