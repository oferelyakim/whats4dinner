# Navigation Patterns

## Bottom Nav Active Detection

```tsx
// NAV_ITEMS array in BottomNav component
// Home uses exact match, all others use startsWith
const isActive = item.path === '/'
  ? location.pathname === '/'
  : location.pathname.startsWith(item.path)
```

The animated indicator uses Framer Motion `layoutId="bottomNavIndicator"` for smooth tab switching.

## Hub Page Tab Pattern

Hub pages use internal tab state with a mix of inline rendering and navigation:

```tsx
// FoodHubPage — pill tabs
const tabs = [
  { id: 'overview', label: t('food.overview') },           // renders inline
  { id: 'recipes', label: t('recipes.title'), href: '/recipes' },  // navigates
  { id: 'plan', label: t('plan.title'), href: '/plan' },
  { id: 'lists', label: t('lists.title'), href: '/lists' },
]

// Active pill style
className={isActive ? 'bg-brand-500 text-white' : 'bg-muted text-muted-foreground'}
```

```tsx
// HouseholdHubPage — segmented control
// Both tabs render inline, no navigation
const [activeTab, setActiveTab] = useState<'chores' | 'activities'>('chores')
```

## Lazy Loading Pattern

All pages use the same unwrapping pattern because they use named exports:

```tsx
const PageName = lazy(() =>
  import('@/pages/PageName').then(m => ({ default: m.PageName }))
)
```

Wrapped in a single `<Suspense fallback={<PageLoader />}>` around all protected routes.

## Adding a Route Checklist

1. Create `src/pages/NewPage.tsx` with named export
2. Add lazy import at top of `App.tsx`
3. Add `<Route path="/domain/path" element={<NewPage />} />` inside AppShell
4. If hub sub-page: add tab entry in hub component
5. If needs bottom nav highlight: ensure path starts with one of the 5 nav prefixes
6. Add page title to `src/locales/en.json` and `src/locales/he.json`
7. If public: place route in the first `<Routes>` block (outside AuthGuard)
