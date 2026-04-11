---
name: event-planning
description: "OurTable events architecture — potluck/dinner party coordination with 5-tab detail page, claim/assign pattern, invite/join flow, clone, calendar export. Use when working on: 'event', 'potluck', 'dinner party', 'event items', 'claim', 'assign', 'co-organizer', 'invite link', 'clone event', 'calendar export', 'EventDetailPage'."
---

# Event Planning Architecture

Events are the potluck/dinner-party coordination feature. Each event has a 5-tab detail view and a unified `event_items` table covering dishes, supplies, and tasks.

## Key Files

| File | Purpose |
|------|---------|
| `src/services/events.ts` | All Supabase queries + service functions |
| `src/pages/EventDetailPage.tsx` | 5-tab detail view + `ItemList` sub-component |
| `src/pages/EventsPage.tsx` | List view (upcoming/past), create dialog |
| `src/pages/JoinEventPage.tsx` | Public join flow (auth + invite code) |
| `src/lib/calendar.ts` | `.ics` generation and download |

## Data Model

```
Event
  ├── event_participants  (attending/invited/declined)
  ├── event_organizers    (co-hosts; composite PK)
  └── event_items         (type: dish | supply | task)
        ├── assigned_to → profiles.id
        └── status: unclaimed | claimed | pending_approval | in_progress | done
```

## 5-Tab Detail Page

```
[Overview] [Mine] [Menu] [Supplies] [Tasks]
```

- **Overview**: description, invite link, calendar export, stats, attendees, clone/delete
- **Mine**: items assigned to current user, split by type
- **Menu**: dishes grouped by category (appetizer/main/side/dessert/drink/other)
- **Supplies**: flat list with quantities
- **Tasks**: grouped by timing (setup/during/cleanup/other), with due dates

## Item Claim/Assign Pattern

**Self-claim**: `claimItem(id)` → assigned_to = user, status = 'claimed'
**Organizer assigns**: `assignItem(id, userId)` → status = 'pending_approval'
**Respond**: `respondToAssignment(id, accept)` → accept = 'claimed', decline = 'unclaimed'

## Organizer vs Participant

```ts
const isOrganizer = organizers.some(o => o.user_id === profile?.id) || event?.created_by === profile?.id
```

## Create Event

Always use `create_event_with_organizer` RPC — atomically inserts event + participant + organizer.

## Clone Event

`cloneEvent(sourceId, newName)` copies event + items, resets all assignments to unclaimed.

## Join Flow

1. `get_event_by_invite_code(code)` — public preview (no auth)
2. Auth → `join_event_by_invite(code)` — upserts into participants
3. Navigate to `/events/:id`

## TanStack Query Keys

`['events']`, `['event', id]`, `['event-participants', id]`, `['event-items', id]`, `['event-organizers', id]`
