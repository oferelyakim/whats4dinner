# Shared Components Reference

## AutocompleteInput

**File**: `src/components/AutocompleteInput.tsx`
**Used by**: Chore form (assignee), Activity form (assignee, participants)

Combo input: shows circle member suggestions as user types, but also accepts free-text (for non-app-user names). Suggestions filtered by input value.

```tsx
<AutocompleteInput
  value={assignee}
  onChange={setAssignee}
  suggestions={circleMembers.map(m => m.display_name)}
  placeholder={t('chores.assignee')}
/>
```

## Skeleton

**File**: `src/components/Skeleton.tsx`
**Used by**: ListsPage, RecipesPage, EventsPage, ChoresPage, ActivitiesPage

Replaces spinners on list pages for perceived performance. Uses `animate-pulse`.

```tsx
<Skeleton className="h-16 w-full rounded-lg" />
// Typical usage: Array.from({ length: 5 }).map(...)
```

## EmptyState

**File**: `src/components/EmptyState.tsx`
**Used by**: Most list pages when no data

```tsx
<EmptyState
  icon={<IconComponent className="h-12 w-12" />}
  title={t('feature.empty')}
  description={t('feature.emptyDescription')}
  action={<Button onClick={handleCreate}>{t('feature.create')}</Button>}
/>
```

## SpeedDial

**File**: `src/components/SpeedDial.tsx`
**Used by**: RecipesPage

Floating action button that expands to show multiple actions (new recipe, import from URL, import from photo, new essentials kit).

## Card

**File**: `src/components/Card.tsx`
**Used by**: Various list views

Styled wrapper: `bg-card rounded-lg p-4 shadow-sm border border-border`.

## NotificationCenter

**File**: `src/components/NotificationCenter.tsx`
**Used by**: Header (bell icon)

Dropdown with activity reminders and chore nudges. Uses browser Notification API for push (not server-side VAPID).

## MonthCalendar

**File**: `src/components/MonthCalendar.tsx`
**Used by**: ActivitiesPage

Month view grid showing activities with dot indicators. Click day to drill down. Uses Zustand for persisted view state (month/week/day).

## UpgradePrompt (AIUpgradeModal + UsageMeter)

**File**: `src/components/UpgradePrompt.tsx`
**Used by**: AI-gated pages + MorePage/Profile

See `ai-features` skill for full details.

## Layout Components

### AppShell (`src/components/layout/AppShell.tsx`)
Wraps all protected routes: Header + optional AI warning banner + `<Outlet />` + BottomNav.
Constrained to `max-w-lg mx-auto`.

### BottomNav (`src/components/layout/BottomNav.tsx`)
5-tab nav with Framer Motion animated indicator. Can be hidden via `useAppStore().bottomNavVisible`.

### Header (`src/components/layout/Header.tsx`)
App title + notification bell icon. Title changes based on current route.

### AuthGuard (`src/components/auth/AuthGuard.tsx`)
Auth gate: loading spinner → LoginPage → OnboardingPage → children.
Dev bypass when `isSupabaseConfigured` is false.
