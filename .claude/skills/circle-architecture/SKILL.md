---
name: circle-architecture
description: "Circle-centric data architecture for OurTable. Circles are the foundational unit — events, shopping lists, meal plans, chores, and activities are always scoped to a circle. Use when designing new features, creating database tables, building navigation, or implementing any data relationship. Every feature must answer 'which circle does this belong to?'"
---

# Circle-Centric Architecture

Circles are the organizational unit. EVERYTHING belongs to a circle.

## Core Principle
- A user can be in multiple circles (family, friend group, roommates)
- Every event, shopping list, meal plan, chore, and activity has a `circle_id` foreign key
- Circle membership determines access — enforced at RLS level
- The `get_my_circle_ids()` security definer function is the foundation of all RLS policies

## Data Model Relationships
```
User <-> CircleMember <-> Circle
                            |-- Event <-> EventItem (potluck coordination)
                            |       \-> EventOrganizer (co-organizers)
                            |-- ShoppingList <-> ShoppingListItem
                            |-- MealPlan <-> MealEntry
                            |-- Recipe (circle-scoped)
                            |-- Chore <-> ChoreCompletion
                            |-- Activity (recurring schedules)
                            \-- Store <-> StoreDepartment
```

## Circle Membership Roles
- `owner` — created the circle, can delete it, full admin
- `admin` — can invite/remove members, manage settings
- `member` — can create/edit shared content within the circle

## Navigation Pattern
- Circle selector is available in profile/settings
- Content views are filtered by active circle context
- Hub pages (Food, Household) aggregate circle-scoped data

## Invite Flow
- Generate invite link (unique code)
- Share via any messaging app (link, not in-app notification)
- Recipient opens link -> signs up or logs in -> auto-joins circle
- Security definer functions: `join_circle_by_invite`, `get_circle_by_invite_code`

## New Feature Checklist
When designing any new feature:
- [ ] Does it have a `circle_id` FK?
- [ ] Are RLS policies using `get_my_circle_ids()`?
- [ ] Can users only see data from their circles?
- [ ] Is the circle context clear in the UI?
- [ ] Does the feature work for users in multiple circles?

## Circle Members Access
```ts
// Get circle members with profiles
import { getCircleMembers } from 'src/services/circles'
const members = await getCircleMembers(circleId)
// Returns: { id, user_id, role, profiles: { display_name, avatar_url } }
```

## Assignment Pattern
Chores and activities use `AutocompleteInput` with:
- Circle member suggestions (from `getCircleMembers`)
- Free-text custom names (for non-app-users)
