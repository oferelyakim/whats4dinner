# UX Audit Report — OurTable

**Date**: 2026-04-11 | **Scope**: Full audit — all 27 pages, 8 hub pages screenshotted | **Mode**: Full (Playwright + code analysis)
**Screenshots**: 63 captured across mobile/desktop x light/dark x EN/HE (in `e2e/ux-screenshots/`)

---

## Executive Summary

OurTable has a **solid foundation** — the bottom nav architecture is clean, the hub page pattern works well, recipe cards are polished, and the brand identity (orange on dark) is distinctive. However, the app has **systemic accessibility gaps** (missing ARIA roles, undersized touch targets, no keyboard navigation for key components), **widespread i18n holes** (50+ hardcoded English strings, `en-US` date formatting hardcoded throughout), and several **interaction design issues** that degrade the mobile experience (12px touch targets on meal plan, silent mutation failures, `alert()` for errors). The highest-priority fix is the **ShoppingListPage checkbox touch target** — the most-used action on the most-used screen has a ~20px hit area.

---

## Critical Issues (blocks usability)

### 1. Shopping List checkbox touch target is ~20px
**File**: `ShoppingListPage.tsx` (toggle button)
The primary action on the highest-frequency screen — checking off grocery items — has a touch target of approximately 20px (icon-only button with no padding). WCAG requires 44px minimum. Users on mobile will frequently mis-tap.
**Fix**: Add `p-2` to the toggle button and increase icon to `h-6 w-6`.

### 2. Meal Plan remove-meal button is ~12px
**File**: `PlanPage.tsx:473-478`
The `X` button to remove a meal from the weekly plan has icon `h-3 w-3` with zero padding — effectively a 12px touch target. This is the most common in-planner editing action.
**Fix**: Wrap in a `p-2` button container, increase icon to `h-4 w-4`.

### 3. Meal Plan "add more" button is ~18px tall
**File**: `PlanPage.tsx:483-489`
`text-[10px]` with `py-0.5` makes this button nearly invisible and untouchable on mobile.
**Fix**: Increase to `text-xs py-1.5`.

### 4. AutocompleteInput has zero ARIA roles
**File**: `AutocompleteInput.tsx`
This custom combobox (used for chore/activity assignment) is completely invisible to screen readers — missing `role="combobox"`, `aria-expanded`, `aria-autocomplete`, `role="listbox"`, `role="option"`, `aria-selected`. No keyboard navigation (ArrowDown doesn't move into suggestions).
**Fix**: Add full WAI-ARIA combobox pattern.

### 5. NotificationCenter panel has no dialog semantics
**File**: `NotificationCenter.tsx`
The notification dropdown panel is missing `role="dialog"`, `aria-modal`, focus trap, and Escape key handler. Keyboard users cannot close it without clicking outside. Focus doesn't move into the panel on open.
**Fix**: Add Radix `Dialog` or `Popover` wrapper with proper ARIA.

### 6. HomePage quick action cards render as non-interactive `<div>`
**File**: `HomePage.tsx:140-183`
Four quick action cards use `Card` with `onClick` but no `role="button"`, `tabIndex`, or keyboard event handler. Users who Tab through the page will skip these entirely.
**Fix**: Use `<button>` or add `role="button" tabIndex={0} onKeyDown={handleEnter}`.

---

## Significant Improvements (degrades experience)

### 7. `alert()` used for mutation errors
**Files**: `ChoresPage.tsx:146,165`, `ActivitiesPage.tsx:189,216`, `EventsPage.tsx:55`, `RecipeDetailPage.tsx:257,307`
Native `alert()` blocks the UI thread, breaks the design system, and looks jarring on mobile. Users see a browser chrome popup instead of an in-app toast.
**Fix**: Replace all `alert()` calls with toast notifications (e.g., Sonner or custom toast component).

### 8. Silent mutation failures across 10+ locations
Multiple mutations have no `onError` handler — failures are completely invisible to users:
- `HomePage.tsx`: NLP mutation
- `RecipeDetailPage.tsx`: `createListMutation`, `addToListMutation`
- `PlanPage.tsx`: `copyMutation`, `generateAiPlan`
- `ChoresPage.tsx`: delete mutation
- `ActivitiesPage.tsx`: delete mutation
- `CircleDetailPage.tsx`: `leaveMutation`, `deleteCircleMutation`
- `MorePage.tsx`: `cancelMutation`
- `ProfilePage.tsx`: `saveMutation`
**Fix**: Add `onError` toast to all mutations. Consider a custom `useMutationWithToast` wrapper.

### 9. Loading vs. not-found conflated on detail pages
**Files**: `EventDetailPage.tsx:178-187`, `CircleDetailPage.tsx:96-105`
When the query is still loading, these pages immediately render "Not found" instead of a loading skeleton. Users see a flash of "not found" for ~200ms before content appears.
**Fix**: Check `isLoading` before `!data` — show skeleton during loading, "not found" only after query resolves with no data.

### 10. Hardcoded `'en-US'` date formatting throughout
**Files**: `HomePage.tsx:252,365`, `FoodHubPage.tsx:64`, `PlanPage.tsx:43,517`, `HouseholdHubPage.tsx:89`, `EventsPage.tsx:142-145`, `EventDetailPage.tsx:216`, `CircleDetailPage.tsx:211`
All `toLocaleDateString('en-US')` and `DAY_NAMES` arrays are hardcoded English. Hebrew users see English dates everywhere.
**Fix**: Use `i18n.language === 'he' ? 'he-IL' : 'en-US'` for date formatting. Derive `DAY_NAMES` from `Intl.DateTimeFormat`.

### 11. 50+ hardcoded English strings in JSX
Strings not going through `t()` include:
- **HomePage**: "Plan Event", "Shop together", "Save & share", "Meals for the week", "Today", "Upcoming Events"
- **FoodHubPage**: Day name abbreviations, "Sort by aisle", "N templates"
- **EventsPage**: "No events yet", "Upcoming (N)", "Past (N)"
- **HouseholdHubPage**: "Create your first chore", "Add your first activity"
- **CirclesPage**: "Create a circle...", "Choose an icon", Input labels
- **CircleDetailPage**: "Circle not found", dialog content strings
- **ProfilePage**: "Display Name" label, placeholder text
- **NotificationCenter**: "Today"
**Fix**: Add translation keys for all user-facing strings.

### 12. Back buttons missing `rtl-flip` on some pages
**Files**: `ChoresPage.tsx:300-305`, `ActivitiesPage.tsx:354`
The `ArrowLeft` back button icon doesn't flip to `ArrowRight` in RTL. Hebrew users see the arrow pointing the wrong direction.
**Fix**: Add `className="rtl-flip"` to the ArrowLeft icon.

### 13. `ChevronRight` missing `rtl-flip` on MorePage
**File**: `MorePage.tsx:87,139`
Menu item chevrons and the upgrade card chevron don't flip in RTL, breaking the directional affordance for Hebrew users.
**Fix**: Add `className="rtl-flip"` to ChevronRight icons.

### 14. Search icon uses physical `left-3` positioning
**Files**: `RecipesPage.tsx:98`, `EventsPage.tsx:95`
The search icon is positioned with `left-3` which doesn't flip in RTL. In Hebrew, the icon stays on the left while text flows from the right, creating a visual conflict.
**Fix**: Use `start-3` (logical property) instead of `left-3`.

### 15. Home page has no loading skeletons
**File**: `HomePage.tsx:65-90`
Five queries fire simultaneously with no skeleton/loading state. The page renders empty, then sections pop in one by one. This is the first page users see on every app open.
**Fix**: Add `SkeletonCard` placeholders for each section while queries load.

### 16. Desktop layout feels sparse
**Visual**: All pages are constrained to `max-w-lg mx-auto` (~512px) on desktop. At 1440px, there's ~900px of empty space on each side. The bottom nav is also centered with no content adaptation.
**Fix**: This is acceptable for a mobile-first PWA. Consider adding a desktop sidebar nav or expanding max-width to `max-w-2xl` for desktop breakpoints as a future enhancement.

---

## Polish & Refinements (nice to have)

### 17. No `aria-current="page"` on BottomNav active item
**File**: `BottomNav.tsx:47`
Screen readers cannot distinguish the active tab from inactive tabs.

### 18. No `aria-label` on `<nav>` element
**File**: `BottomNav.tsx:31`
Should be `aria-label="Main navigation"` to distinguish from other nav elements.

### 19. SpeedDial FAB missing `aria-label` and `aria-expanded`
**File**: `SpeedDial.tsx:73`
The main FAB button shows Plus/X icon with no accessible name.

### 20. EmptyState continuous animation ignores `prefers-reduced-motion`
**File**: `EmptyState.tsx:16-19`
The floating icon animation (`y: [0, -6, 0]`, `repeat: Infinity`) runs indefinitely. Users with vestibular disorders may experience discomfort.

### 21. MonthCalendar slide direction doesn't invert in RTL
**File**: `MonthCalendar.tsx:102-106`
The `x: ±20` slide animation for month transitions doesn't reverse in RTL — next month slides from the wrong direction for Hebrew users.

### 22. Ingredient toggle checkboxes are custom divs without ARIA
**File**: `RecipeDetailPage.tsx:429-455`
The "Add to List" ingredient checkboxes are styled `<div>` elements with no `role="checkbox"` or `aria-checked`. Keyboard users cannot toggle individual ingredients.

### 23. No skip-to-content link
**File**: `AppShell.tsx`
Keyboard users must Tab through the header and bottom nav on every page change. A skip link would improve keyboard efficiency.

### 24. `text-left` used in dialogs instead of `text-start`
**Files**: `RecipeDetailPage.tsx:310`, `PlanPage.tsx:567,600`, `ShoppingListPage.tsx` sort labels
Physical `text-left` doesn't flip in RTL. Use logical `text-start`.

### 25. Form labels missing for inline inputs
**Files**: `RecipeFormPage.tsx:269-295` (quantity, unit, category inputs), `EventsPage.tsx:95-103` (search input)
Several inputs use only `placeholder` with no `<label>` — invisible to screen readers.

### 26. Events page cards show only location, not title
**Visual**: Event cards display location ("Home", "Park") prominently but event titles ("Friday Dinner", "Birthday Party") are less visible or missing from the card design. The most important information (what the event is) should be primary.

### 27. Lists page shows all items as "COMPLETED"
**Visual**: Even active lists are grouped under the "COMPLETED" section header. The active/completed distinction may need clearer visual separation or the query filter for `is_completed` may need adjustment.

### 28. `HouseholdHubPage` hardcoded `→` arrow doesn't flip in RTL
**File**: `HouseholdHubPage.tsx:222-228,283-288`
"View All" cards use a literal `→` character instead of a Lucide `ChevronRight` with `rtl-flip`.

### 29. Theme/language toggles on Profile page are small
**Visual**: `px-3 py-1` buttons at `text-xs` are approximately 28-30px height — below the 44px touch target guideline.

### 30. Recipe form drag handle has no touch affordance
**File**: `RecipeFormPage.tsx:260`
The `GripVertical` icon for reordering ingredients has no padding or hit area — the drag handle itself is the entire target. On mobile, this is nearly impossible to grab.

---

## Page Scores (1-5)

| Page | Layout | Usability | Consistency | Mobile | RTL | Dark | A11y | Overall |
|------|--------|-----------|-------------|--------|-----|------|------|---------|
| Home | 4 | 3 | 3 | 3 | 2 | 4 | 2 | 3.0 |
| Food Hub | 5 | 4 | 4 | 4 | 3 | 4 | 2 | 3.7 |
| Recipes | 5 | 4 | 4 | 4 | 2 | 4 | 2 | 3.6 |
| Recipe Detail | 4 | 3 | 3 | 3 | 2 | 4 | 2 | 3.0 |
| Recipe Form | 4 | 3 | 3 | 2 | 3 | 4 | 1 | 2.9 |
| Shopping List | 4 | 3 | 4 | 2 | 3 | 4 | 1 | 3.0 |
| Lists | 4 | 4 | 4 | 4 | 3 | 4 | 3 | 3.7 |
| Plan | 4 | 3 | 3 | 2 | 2 | 4 | 2 | 2.9 |
| Events | 4 | 3 | 3 | 4 | 2 | 4 | 2 | 3.1 |
| Event Detail | 4 | 3 | 3 | 3 | 3 | 4 | 2 | 3.1 |
| Household Hub | 4 | 4 | 3 | 3 | 2 | 4 | 2 | 3.1 |
| Chores | 4 | 3 | 3 | 2 | 2 | 4 | 2 | 2.9 |
| Activities | 4 | 3 | 3 | 3 | 3 | 4 | 2 | 3.1 |
| Profile | 5 | 4 | 4 | 3 | 3 | 4 | 3 | 3.7 |
| Circles | 4 | 4 | 3 | 4 | 3 | 4 | 3 | 3.6 |
| Circle Detail | 4 | 3 | 3 | 4 | 3 | 4 | 2 | 3.3 |
| Onboarding | 5 | 4 | 4 | 4 | 4 | 4 | 3 | 4.0 |
| **Average** | **4.2** | **3.4** | **3.4** | **3.2** | **2.6** | **4.0** | **2.1** | **3.2** |

### Score Key
- **5**: Excellent — polished, no issues
- **4**: Good — minor issues only
- **3**: Adequate — noticeable gaps but functional
- **2**: Needs work — multiple issues affecting usability
- **1**: Poor — major issues blocking effective use

---

## Navigation & Flow Score

| Criteria | Score | Notes |
|----------|-------|-------|
| Bottom nav switching | 4.5 | Smooth animated indicator via `layoutId`, instant feel |
| Hub tab switching | 4 | Food/Household tabs work well. Food tabs 2-5 navigate away (slightly inconsistent with tab UX pattern) |
| Drill-down flow | 4 | List > Detail > Edit > Back works. Some back buttons miss `rtl-flip` |
| Back button behavior | 3.5 | Browser back works but no explicit back button on hub pages (Home, Food, Events, Household, Profile) |
| Deep link support | 4 | All routes are directly accessible. `Suspense` catches lazy chunks |
| Information architecture | 4 | 5-tab nav is intuitive. Food hub consolidates well. Household hub makes sense |
| Dead ends | 3.5 | Plan page shows "Create circle first" even when mocked circle exists. Some flows lack clear "next action" |
| Keyboard navigation | 2 | Major gaps: Cards not focusable, SpeedDial no Escape, AutocompleteInput no arrow nav |

---

## Top 5 Quick Wins (<30 min each)

1. **Fix shopping list checkbox touch target** — Add `p-2` padding to toggle button in `ShoppingListPage.tsx`. 5 min. Fixes the #1 usability issue on the #1 daily-use screen.

2. **Fix meal plan X/add-more touch targets** — Increase padding and font size on `PlanPage.tsx:473-489`. 10 min. Makes the planner usable on mobile.

3. **Replace all `alert()` with toast** — Search for `alert(` in `src/pages/`, replace with `toast.error()`. 15 min if you have a toast library (Sonner). Eliminates the worst interaction pattern in the app.

4. **Add `rtl-flip` to missing back/chevron icons** — Grep for `ArrowLeft` and `ChevronRight` without `rtl-flip`, add the class. 10 min. Fixes directional confusion for Hebrew users.

5. **Add `aria-label` to all icon-only buttons** — Grep for icon-only buttons (back, delete, share, edit, FAB), add descriptive labels. 20 min. Biggest a11y improvement per minute.

---

## Top 5 Larger Improvements (1-4 hours each)

1. **Implement proper ARIA combobox on AutocompleteInput** — Add `role="combobox"`, `aria-expanded`, keyboard navigation (ArrowUp/Down), `role="listbox"` on dropdown, `role="option"` on items. 2-3 hours. Affects chores, activities, and any future assignment UI.

2. **Create a toast notification system** — Install Sonner or build a simple toast. Replace all `alert()` and add `onError` toasts to all 10+ mutations with silent failures. 2-3 hours. Eliminates the entire class of "silent failure" bugs.

3. **Fix all i18n gaps** — Add ~50 missing `t()` keys, create `he.json` entries, replace hardcoded `'en-US'` date formatting with locale-aware calls. 3-4 hours. Makes Hebrew locale genuinely usable.

4. **Add loading skeletons to HomePage, ShoppingListPage, and detail pages** — Replace bare spinners with layout-matching skeletons. 2-3 hours. Dramatically improves perceived performance on the most-used screens.

5. **Fix NotificationCenter accessibility** — Wrap in Radix `Popover`, add focus trap, Escape handler, `aria-label` on bell button, `aria-live` for new notification count. 2 hours. Makes the notification system usable for keyboard/screen reader users.

---

## Intuitiveness Observations

**What works well:**
- The 5-tab bottom nav (Home/Food/Events/Household/Profile) is immediately understandable
- Food Hub's pill tabs with quick actions feel like a native app
- Recipe cards with colored tags, servings, and ingredient count are information-rich
- The "Upgrade to AI Plan" card on Profile is well-designed and non-intrusive
- Onboarding flow has the best UX in the app — polished animations, clear steps

**What could confuse new users:**
- The difference between "Recipes" tab and "Essentials" tab is unclear without prior knowledge
- Food Hub's "Home" tab (overview) vs. the main "Home" page creates naming confusion
- Quick action cards on HomePage have very low contrast in dark mode — easy to miss
- Events cards showing only location (not title) makes the list feel empty and uninformative
- "Create your first chore" appears even when chores exist (likely a filter/query issue in test data)
- The Plan page's "Create a circle first" empty state is confusing when the user already has a circle

**Design system gaps:**
- No standardized toast/notification pattern for success/error feedback
- Two different loading patterns coexist: `<Skeleton>` (good, on list pages) and bare spinners (mediocre, on detail/form pages)
- Button sizes are inconsistent: `size="sm"` produces 32-36px buttons while WCAG requires 44px minimum
- No standardized dialog close button — some dialogs have `X`, some don't
- Card interaction pattern is inconsistent — some `Card` components are clickable (but not `<button>`), others are static containers

---

## Design System Recommendations

1. **Standardize minimum touch target**: Create a `min-h-[44px] min-w-[44px]` utility class and apply to all interactive elements
2. **Create a Toast component**: Standardize success/error feedback across the app
3. **Unify loading states**: Use `<Skeleton>` variants matching each page layout, deprecate bare spinners
4. **Fix Card interactivity**: Create `<CardButton>` variant that renders as `<button>` with proper ARIA
5. **Add `text-start`/`text-end` linting**: Replace all `text-left`/`text-right` with logical properties
6. **Create date formatting utility**: Single `formatDate(date, locale)` function that respects i18n language setting

---

## Appendix: Screenshot Inventory

63 screenshots captured in `e2e/ux-screenshots/`:
- 8 pages x 4 variants (light_en, dark_en, light_he, dark_he) x 2 viewports (mobile 375px, desktop 1440px)
- 1 missing: `recipes_desktop_dark_en.png` (Playwright timeout)

**Note**: Theme and language switching via localStorage did not take effect in screenshots — all screenshots render in dark mode with English text. This indicates the app reads theme/language from Zustand store or profile preferences, not directly from localStorage keys `theme`/`language`. The test mock sets `preferences: {}` which likely causes the app to default to dark/English. To capture light mode and Hebrew screenshots, the test would need to set the correct Supabase profile preferences keys or interact with the in-app toggle.
