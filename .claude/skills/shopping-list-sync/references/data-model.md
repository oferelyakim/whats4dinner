# Data Model — Shopping Lists

## Tables

### `shopping_lists`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | required |
| circle_id | uuid FK → circles | cascade |
| store_id | uuid FK → stores | nullable, set null |
| status | text | `active` / `completed` / `archived` |
| created_by | uuid FK → profiles | cascade |
| created_at / updated_at | timestamptz | updated_at auto-triggered |

### `shopping_list_items`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| list_id | uuid FK → shopping_lists | cascade |
| item_id | uuid FK → items | nullable (global ingredient ref) |
| recipe_id | uuid FK → recipes | nullable (tracks source recipe) |
| menu_id | uuid FK → meal_menus | nullable (tracks source menu) |
| name | text | required |
| quantity | decimal | nullable |
| unit | text | default '' |
| category | text | default 'Other' — maps to Department enum |
| is_checked | boolean | default false |
| checked_by | uuid FK → profiles | nullable |
| sort_order | integer | default 0 — manual DnD order |
| notes | text | nullable — e.g. 'From: RecipeName' |
| added_by | uuid FK → profiles | cascade |

Realtime enabled: `ALTER PUBLICATION supabase_realtime ADD TABLE shopping_list_items`

### `shopping_list_access`
| Column | Type | Notes |
|--------|------|-------|
| list_id + user_id | composite PK | |
| permission | text | `view` / `edit` / `admin` |

### `stores` / `store_routes`
Stores scoped to circle. Routes define department ordering per store.
`store_routes` has `UNIQUE(store_id, department)`.

## RLS Summary

- `shopping_lists`: SELECT for creator OR access record; INSERT/DELETE for creator
- `shopping_list_items`: inherits list visibility via subquery
- Security definer: `create_shopping_list(p_name, p_circle_id)` — atomic list creation

## Key Queries

```ts
// Index with item count
supabase.from('shopping_lists').select('*, items:shopping_list_items(count)')

// Detail — parallel fetch
supabase.from('shopping_lists').select('*').eq('id', id).single()
supabase.from('shopping_list_items').select('*').eq('list_id', id).order('sort_order')

// Toggle — sets checked_by
supabase.from('shopping_list_items')
  .update({ is_checked, checked_by: isChecked ? user.id : null })
  .eq('id', itemId)

// Create via RPC
supabase.rpc('create_shopping_list', { p_name, p_circle_id })
```

## Department Enum

Defined in `src/lib/constants.ts` as `DEPARTMENTS`. Used as `category` on items and key for `store_routes`. Items without matching route get sort order `999`.
