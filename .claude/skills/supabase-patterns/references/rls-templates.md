# RLS Policy Templates

Common RLS policy patterns for circle-scoped resources in OurTable.

## Core Helper Function

```sql
-- Already exists — do not recreate
CREATE OR REPLACE FUNCTION get_my_circle_ids()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT circle_id FROM circle_members WHERE user_id = auth.uid() $$;
```

## Standard Circle-Scoped Table

For any table with a `circle_id` column:

```sql
-- Enable RLS
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

-- SELECT: user is member of the circle
CREATE POLICY "<table>_select" ON <table_name>
  FOR SELECT USING (circle_id IN (SELECT get_my_circle_ids()));

-- INSERT: user is member of the target circle
CREATE POLICY "<table>_insert" ON <table_name>
  FOR INSERT WITH CHECK (circle_id IN (SELECT get_my_circle_ids()));

-- UPDATE: user is member of the circle (optionally restrict to owner/admin)
CREATE POLICY "<table>_update" ON <table_name>
  FOR UPDATE USING (circle_id IN (SELECT get_my_circle_ids()));

-- DELETE: user is owner of the record or circle admin
CREATE POLICY "<table>_delete" ON <table_name>
  FOR DELETE USING (
    created_by = auth.uid()
    OR circle_id IN (
      SELECT circle_id FROM circle_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
```

## Child Table (belongs to a circle-scoped parent)

For tables like `shopping_list_items` that belong to a circle-scoped parent:

```sql
-- Use a security definer to look up accessible parent IDs
CREATE OR REPLACE FUNCTION get_my_accessible_<parent>_ids()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT id FROM <parent_table>
  WHERE circle_id IN (SELECT get_my_circle_ids())
$$;

CREATE POLICY "<child>_select" ON <child_table>
  FOR SELECT USING (<parent_id> IN (SELECT get_my_accessible_<parent>_ids()));
```

## User-Owned Table (profiles, subscriptions)

For tables scoped to a single user, not a circle:

```sql
CREATE POLICY "users_own_data" ON <table_name>
  FOR ALL USING (user_id = auth.uid());
```

## Security Definer for Cross-RLS Operations

When an operation needs to write to multiple tables or bypass RLS:

```sql
CREATE OR REPLACE FUNCTION <operation_name>(...)
RETURNS <return_type>
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Validate caller has permission
  IF NOT EXISTS (SELECT 1 FROM circle_members WHERE user_id = auth.uid() AND ...) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Perform the operation
  INSERT INTO ...;
  RETURN ...;
END;
$$;
```

## Idempotent Migration Pattern

```sql
-- Use DO blocks for idempotent policy creation
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'policy_name' AND tablename = 'table_name'
  ) THEN
    CREATE POLICY "policy_name" ON table_name FOR SELECT USING (...);
  END IF;
END $$;
```
