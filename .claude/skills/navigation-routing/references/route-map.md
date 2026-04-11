# Route Map

## Public Routes (no auth, outside AuthGuard)

| Path | Component | Purpose |
|------|-----------|---------|
| `/join/:code` | `JoinCirclePage` | Join circle via invite link |
| `/join-event/:code` | `JoinEventPage` | Join event via invite link |
| `/r/:code` | `SharedRecipePage` | View shared recipe |

## Protected Routes (inside AuthGuard > AppShell)

### Home
| Path | Component |
|------|-----------|
| `/` | `HomePage` |

### Food Domain
| Path | Component | Hub tab? |
|------|-----------|----------|
| `/food` | `FoodHubPage` | — (hub itself) |
| `/recipes` | `RecipesPage` | Recipes |
| `/recipes/new` | `RecipeFormPage` | |
| `/recipes/import` | `RecipeImportPage` | |
| `/recipes/new-kit` | `SupplyKitFormPage` | |
| `/recipes/:id` | `RecipeDetailPage` | |
| `/recipes/:id/edit` | `RecipeFormPage` | |
| `/lists` | `ListsPage` | Lists |
| `/lists/new` | `NewListPage` | |
| `/lists/:id` | `ShoppingListPage` | |
| `/plan` | `PlanPage` | Plan |
| `/food/templates` | `MealMenusPage` | |
| `/food/stores` | `StoresPage` | |
| `/food/stores/:id` | `StoreRoutePage` | |

### Events Domain
| Path | Component |
|------|-----------|
| `/events` | `EventsPage` |
| `/events/:id` | `EventDetailPage` |

### Household Domain
| Path | Component | Hub tab? |
|------|-----------|----------|
| `/household` | `HouseholdHubPage` | — (hub itself) |
| `/household/activities` | `ActivitiesPage` | Activities |
| `/household/chores` | `ChoresPage` | Chores |

### Profile Domain
| Path | Component |
|------|-----------|
| `/profile` | `MorePage` |
| `/profile/circles` | `CirclesPage` |
| `/profile/circles/:id` | `CircleDetailPage` |
| `/profile/settings` | `ProfilePage` |

### Legacy Redirects
| Old path | Maps to same component as |
|----------|--------------------------|
| `/more` | `/profile` |
| `/more/circles` | `/profile/circles` |
| `/more/circles/:id` | `/profile/circles/:id` |
| `/more/profile` | `/profile/settings` |
| `/more/activities` | `/household/activities` |
| `/more/chores` | `/household/chores` |
| `/more/menus` | `/food/templates` |
| `/more/stores` | `/food/stores` |
| `/more/stores/:id` | `/food/stores/:id` |
