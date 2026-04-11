# Events Data Model

## Tables

### `events`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | required |
| description | text | nullable |
| event_date | timestamptz | nullable |
| location | text | nullable |
| created_by | uuid FK → profiles | cascade |
| circle_id | uuid FK → circles | nullable, set null |
| invite_code | text | unique hex (6 bytes) |

### `event_participants`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| event_id | uuid FK → events | cascade |
| user_id | uuid FK → profiles | nullable (for guests) |
| guest_name / guest_email | text | nullable |
| status | text | `invited` / `attending` / `declined` |

### `event_organizers`
| Column | Type | Notes |
|--------|------|-------|
| event_id + user_id | composite PK | |

### `event_items`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| event_id | uuid FK → events | cascade |
| type | text | `dish` / `supply` / `task` |
| name | text | |
| category | text | dish: appetizer/main/side/dessert/drink/other; task: setup/during/cleanup/other |
| quantity | integer | nullable (supplies) |
| recipe_id | uuid FK → recipes | nullable |
| assigned_to | uuid FK → profiles | nullable |
| guest_name | text | nullable (non-app-users) |
| notes | text | nullable |
| due_at | timestamptz | nullable (tasks) |
| status | text | `unclaimed` / `claimed` / `pending_approval` / `in_progress` / `done` |
| sort_order | integer | default 0 |

Realtime enabled on `event_items`.

## Security Definer Functions

| Function | Purpose |
|----------|---------|
| `create_event_with_organizer(...)` | Atomic: event + participant + organizer |
| `join_event_by_invite(code)` | Upserts participant (ON CONFLICT DO NOTHING) |
| `get_event_by_invite_code(code)` | Public lookup — no auth required |
| `is_event_organizer(event_id)` | True if creator OR in event_organizers |
| `can_see_event(event_id)` | True if creator, participant, or organizer |
| `get_my_event_ids()` | Event IDs accessible to caller |

## RLS Summary

- **events**: SELECT for creator, circle member, or participant; UPDATE/DELETE for organizer/creator
- **event_items**: SELECT for anyone who can see event; UPDATE for assigned user or organizer
- **event_participants**: SELECT inherits event visibility
- **event_organizers**: managed by original creator only
