# EventDetailPage — 5-Tab Structure

Route: `/events/:id` — Component: `src/pages/EventDetailPage.tsx`

## Tabs

### Overview
- Event description, invite link (copy button), "Add to Calendar" button
- Stats: attending count, claimed/total items, tasks done/total
- Attendees list with organizer crown badges, "Make Host" button
- Clone + Delete buttons (organizer only)

### Mine
Items where `assigned_to === profile.id`, split into My Dishes / My Supplies / My Tasks.
Empty state: "Nothing assigned to you yet."

### Menu (dishes)
`<ItemList type="dish" categories={DISH_CATEGORIES} />`
Categories: appetizer, main, side, dessert, drink, other (each with emoji).
Grouped: unclaimed first, then claimed by category.

### Supplies
`<ItemList type="supply" />` — flat list, shows quantity (e.g. "x24 Plates").

### Tasks
`<ItemList type="task" categories={TASK_CATEGORIES} />`
Categories: setup, during, cleanup, other (timing phases).
Shows `due_at` datetime if set.

## ItemList Sub-Component (internal)

Defined at bottom of `EventDetailPage.tsx`. Handles claim/unclaim/assign/status buttons.
Organizers see "Assign to..." dropdown from attending participants list.

## Add Item Dialog

Bottom sheet with fields varying by type:
- **dish**: name + category pill picker
- **supply**: name + quantity number
- **task**: name + timing category pills + due datetime

## Data Loading (parallel queries)

```ts
useQuery(['event', id], getEvent)
useQuery(['event-participants', id], getEventParticipants)
useQuery(['event-items', id], getEventItems)
useQuery(['event-organizers', id], getEventOrganizers)
```
