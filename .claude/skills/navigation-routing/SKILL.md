---
name: navigation-routing
description: "Route structure, lazy loading, and navigation patterns for OurTable. Use when working on: 'route', 'navigation', 'bottom nav', 'lazy', 'code splitting', 'redirect', 'page', 'new page', 'hub', 'tab'."
---

# Navigation & Routing

React Router v6 with lazy-loaded pages. Defined in `src/App.tsx`.

## Architecture

- **29 lazy-loaded pages** via `React.lazy()` with named export unwrapping: `.then(m => ({ default: m.PageName }))`
- **Two `<Routes>` blocks**: public routes outside `AuthGuard`, protected routes inside
- **`AuthGuard`**: shows spinner while loading, `LoginPage` if no session, `OnboardingPage` if `has_onboarded === false`
- **`AppShell`**: `Header` + optional AI usage banner + `<Outlet />` + `BottomNav`, constrained to `max-w-lg mx-auto`
- **`PageLoader`**: shared spinner fallback for `<Suspense>`

## Bottom Nav

5 tabs in `BottomNav` component (`NAV_ITEMS` array):
| Tab | Path | Active detection |
|-----|------|-----------------|
| Home | `/` | exact match |
| Food | `/food` | `startsWith('/food')` |
| Events | `/events` | `startsWith('/events')` |
| Household | `/household` | `startsWith('/household')` |
| Profile | `/profile` | `startsWith('/profile')` |

- Animated orange dot indicator via Framer Motion `layoutId="bottomNavIndicator"`
- Can be hidden via `useAppStore().bottomNavVisible`

## Hub Pages (internal tab navigation)

**FoodHubPage** (`/food`): 5 pill tabs
- `overview` — renders inline (quick actions, this week's meals, active lists)
- `recipes` → navigates to `/recipes`
- `essentials` → navigates to `/recipes?view=essentials`
- `plan` → navigates to `/plan`
- `lists` → navigates to `/lists`
- Active style: `bg-brand-500 text-white`

**HouseholdHubPage** (`/household`): 2-tab segmented control
- `chores` / `activities` — both render inline
- Today's summary banner above the segmented control

## TanStack Query

- `staleTime: 5min`, `retry: 1`, `networkMode: 'offlineFirst'`
- Cache persisted to IndexedDB every 30s and on `visibilitychange`
- Restored on app load via `restoreQueryCache()`
- `queryClient.invalidateQueries()` called when browser goes back online

## Adding a New Route

1. Create page component in `src/pages/` (named export)
2. Add lazy import in `App.tsx`: `const XPage = lazy(() => import('@/pages/XPage').then(m => ({ default: m.XPage })))`
3. Add `<Route>` inside the `<Route element={<AppShell />}>` block
4. If it belongs to a hub, add tab entry in the hub page component
5. Add i18n keys for page title
