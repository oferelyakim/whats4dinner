-- Migration 033 — Event Planner v2 (dynamic questionnaire)
-- Adds:
--   • events.archetype, events.questionnaire jsonb, events.draft_plan jsonb
--     (in-progress questionnaire state + draft plan that survives sessions)
--   • event_activity_catalog table (read-only catalog of vendor categories /
--     activities the questionnaire can suggest without burning AI calls)
-- Idempotent.

-- ─── 1. extend events ──────────────────────────────────────────────────────

alter table public.events
  add column if not exists archetype text,
  add column if not exists questionnaire jsonb not null default '{}'::jsonb,
  add column if not exists draft_plan jsonb;

-- archetype is an open vocabulary (no CHECK) so adding a new archetype
-- doesn't require a migration. The client validates against the enum
-- in src/engine/event/types.ts.

create index if not exists events_archetype_idx
  on public.events(archetype)
  where archetype is not null;

-- ─── 2. event_activity_catalog ────────────────────────────────────────────

create table if not exists public.event_activity_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  -- Which archetypes this row is relevant for. Empty array = match all.
  archetypes text[] not null default '{}',
  -- Age range this activity fits (in years). NULL means any age.
  age_min int,
  age_max int,
  -- Group size sweet spot. NULL = any size.
  group_size_min int,
  group_size_max int,
  -- Indoor / outdoor / both. NULL = both.
  venue text check (venue in ('indoor', 'outdoor', 'both')),
  -- Budget tier. NULL = any.
  budget_tier text check (budget_tier in ('shoestring', 'modest', 'comfortable', 'premium')),
  -- Vendor category, used by find-vendors op for search keyword generation.
  vendor_category text,
  -- Default supplies that come with picking this activity.
  default_supplies jsonb not null default '[]'::jsonb,
  -- Suggested tasks (with timeline window) when this activity is picked.
  suggested_tasks jsonb not null default '[]'::jsonb,
  -- Search-friendly keywords for vendor lookups (US-first).
  search_terms text[] not null default '{}',
  -- For sort ordering when several rows match.
  weight int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_activity_catalog_archetypes_idx
  on public.event_activity_catalog using gin (archetypes);

create index if not exists event_activity_catalog_age_idx
  on public.event_activity_catalog(age_min, age_max);

alter table public.event_activity_catalog enable row level security;

-- Catalog is generic non-PII content — readable by all authenticated users.
drop policy if exists "Authenticated can read activity catalog" on public.event_activity_catalog;
create policy "Authenticated can read activity catalog"
  on public.event_activity_catalog for select
  using (auth.role() = 'authenticated');

-- ─── 3. seed catalog ──────────────────────────────────────────────────────
-- ~32 rows covering kid activities, adult activities, vendor types,
-- and atmosphere moments. Idempotent via ON CONFLICT (slug).

insert into public.event_activity_catalog
  (slug, name, description, archetypes, age_min, age_max, group_size_min, group_size_max, venue, budget_tier, vendor_category, default_supplies, suggested_tasks, search_terms, weight)
values
  -- Kid entertainment
  ('magician', 'Magician', '30-45 min show, ages 4-12', array['birthday','reunion','holiday','activity-day'], 4, 12, 8, 60, 'both', 'modest', 'magician',
    '[]'::jsonb,
    '[{"title":"Book magician","due_when":"3-4 weeks before","assignable":false}]'::jsonb,
    array['kids magician', 'birthday party magician', 'children magic show'], 90),
  ('balloon-artist', 'Balloon artist', 'Twisting balloon animals at the party, 1-2hr', array['birthday','reunion','activity-day','picnic'], 3, 12, 6, 80, 'both', 'modest', 'balloon-artist',
    '[]'::jsonb,
    '[{"title":"Book balloon artist","due_when":"2-3 weeks before","assignable":false}]'::jsonb,
    array['balloon twister', 'birthday balloon artist', 'balloon entertainer'], 80),
  ('bouncy-house', 'Bouncy house rental', 'Inflatable for kids, needs flat outdoor space + power', array['birthday','reunion','activity-day','picnic'], 3, 14, 8, 100, 'outdoor', 'comfortable', 'inflatable-rental',
    '[{"name":"Extension cord (50ft+)","quantity":"1","claimable":false},{"name":"Flat ground / tarp underneath","quantity":"1","claimable":false}]'::jsonb,
    '[{"title":"Book inflatable rental","due_when":"4 weeks before","assignable":false},{"title":"Confirm power outlet within 50ft","due_when":"week before","assignable":false}]'::jsonb,
    array['bounce house rental', 'inflatable bouncer rental', 'kids bounce house'], 95),
  ('face-painting', 'Face painting', 'Hire artist or DIY kit', array['birthday','reunion','activity-day','picnic'], 3, 12, 5, 50, 'both', 'shoestring', 'face-painter',
    '[{"name":"Face paint kit (if DIY)","quantity":"1","claimable":true},{"name":"Wet wipes","quantity":"1 pack","claimable":false}]'::jsonb,
    '[{"title":"Book face painter or buy DIY kit","due_when":"2 weeks before","assignable":true}]'::jsonb,
    array['face painter for parties', 'kids face painting'], 70),
  ('treasure-hunt', 'Treasure hunt', 'DIY clue-based hunt, ages 5-12', array['birthday','reunion','activity-day'], 5, 12, 4, 30, 'both', 'shoestring', null,
    '[{"name":"Small prizes / treasure","quantity":"per kid","claimable":true},{"name":"Clue cards","quantity":"5-10","claimable":false}]'::jsonb,
    '[{"title":"Write clues + hide treasure","due_when":"day before","assignable":true}]'::jsonb,
    array[]::text[], 75),
  ('craft-station', 'Craft station', 'Self-serve table with craft supplies', array['birthday','reunion','holiday','activity-day'], 3, 12, 4, 40, 'both', 'shoestring', null,
    '[{"name":"Craft supplies (paper, glue, markers)","quantity":"per kid","claimable":true},{"name":"Smocks / old t-shirts","quantity":"5-10","claimable":true}]'::jsonb,
    '[{"title":"Set up craft table","due_when":"day-of, before guests arrive","assignable":true}]'::jsonb,
    array[]::text[], 65),
  ('musical-chairs', 'Musical chairs', 'Classic game, all ages', array['birthday','reunion','activity-day'], 4, 99, 6, 30, 'both', 'shoestring', null,
    '[{"name":"Bluetooth speaker","quantity":"1","claimable":true}]'::jsonb,
    '[]'::jsonb, array[]::text[], 50),
  ('pinata', 'Piñata', 'Suspended candy-filled, blindfold + bat', array['birthday','reunion','holiday'], 4, 99, 4, 50, 'both', 'shoestring', null,
    '[{"name":"Piñata + filling","quantity":"1","claimable":true},{"name":"Bat or stick","quantity":"1","claimable":false},{"name":"Blindfold","quantity":"1","claimable":false}]'::jsonb,
    '[{"title":"Buy + fill piñata","due_when":"week before","assignable":true}]'::jsonb,
    array['piñata', 'birthday pinata'], 70),

  -- Adult entertainment
  ('local-band', 'Local band / live music', '2-3 hour set, 3-5 piece', array['holiday','reunion','housewarming','birthday'], 18, 99, 20, 200, 'both', 'comfortable', 'local-band',
    '[{"name":"PA system / amp","quantity":"1","claimable":false},{"name":"Power outlets nearby","quantity":"1","claimable":false}]'::jsonb,
    '[{"title":"Book band","due_when":"6-8 weeks before","assignable":false},{"title":"Confirm sound check time","due_when":"week before","assignable":false}]'::jsonb,
    array['local band for hire', 'cover band party', 'live music event'], 90),
  ('dj', 'DJ', '3-4 hour set with playlist requests', array['holiday','reunion','housewarming','birthday','activity-day'], 13, 99, 15, 200, 'both', 'comfortable', 'dj',
    '[{"name":"PA system","quantity":"1","claimable":false},{"name":"Power outlets nearby","quantity":"1","claimable":false}]'::jsonb,
    '[{"title":"Book DJ","due_when":"4 weeks before","assignable":false},{"title":"Send playlist preferences","due_when":"week before","assignable":true}]'::jsonb,
    array['party dj for hire', 'event dj near me'], 85),
  ('guest-chef', 'Guest chef', 'Local chef cooks live, 1.5-2hr active service', array['holiday','reunion','housewarming','birthday'], 18, 99, 8, 50, 'both', 'premium', 'private-chef',
    '[{"name":"Kitchen access / prep station","quantity":"1","claimable":false}]'::jsonb,
    '[{"title":"Book chef + agree menu","due_when":"4-6 weeks before","assignable":false},{"title":"Confirm dietary restrictions with chef","due_when":"2 weeks before","assignable":false},{"title":"Shop ingredients (or chef does it)","due_when":"day before","assignable":true}]'::jsonb,
    array['private chef for hire', 'in-home chef event'], 90),
  ('photographer', 'Event photographer', '2-3hr coverage of the gathering', array['holiday','reunion','housewarming','birthday'], 0, 99, 10, 200, 'both', 'comfortable', 'photographer',
    '[]'::jsonb,
    '[{"title":"Book photographer","due_when":"3-4 weeks before","assignable":false},{"title":"Send must-have shot list","due_when":"week before","assignable":true}]'::jsonb,
    array['event photographer near me', 'family reunion photographer'], 75),
  ('group-photo', 'Group photo moment', 'Gather everyone for one big photo', array['family-dinner','holiday','reunion','birthday','housewarming','potluck'], 0, 99, 5, 200, 'both', 'shoestring', null,
    '[{"name":"Tripod (or designated photographer)","quantity":"1","claimable":true}]'::jsonb,
    '[{"title":"Pick photo time + spot","due_when":"day-of","assignable":true}]'::jsonb,
    array[]::text[], 80),
  ('ice-breaker', 'Ice-breaker game', 'Get-to-know-you prompts', array['reunion','housewarming','potluck','activity-day'], 12, 99, 6, 40, 'both', 'shoestring', null,
    '[{"name":"Printed prompts / cards","quantity":"1 set","claimable":true}]'::jsonb,
    '[{"title":"Print prompts","due_when":"day before","assignable":true}]'::jsonb,
    array[]::text[], 60),
  ('storytelling', 'Storytelling circle', 'Elders share memories, 20-30min', array['reunion','holiday'], 0, 99, 5, 40, 'both', 'shoestring', null,
    '[]'::jsonb,
    '[{"title":"Pick prompt + invite an elder to lead","due_when":"week before","assignable":true}]'::jsonb,
    array[]::text[], 65),
  ('toast-moment', 'Welcome / toast moment', 'Host gives short welcome with a drink', array['holiday','reunion','housewarming','birthday','family-dinner'], 18, 99, 4, 200, 'both', 'shoestring', null,
    '[{"name":"Drinks for toast (cheap sparkling)","quantity":"1 per adult","claimable":true}]'::jsonb,
    '[{"title":"Prepare 1-min welcome","due_when":"day-of","assignable":false}]'::jsonb,
    array[]::text[], 55),
  ('trivia', 'Trivia / quiz game', 'Family/friend trivia, 30-45 min', array['reunion','holiday','housewarming','birthday'], 8, 99, 6, 30, 'both', 'shoestring', null,
    '[{"name":"Trivia questions (printed)","quantity":"1 set","claimable":true},{"name":"Pens + paper","quantity":"per team","claimable":true}]'::jsonb,
    '[{"title":"Write trivia questions","due_when":"week before","assignable":true}]'::jsonb,
    array[]::text[], 60),
  ('charades', 'Charades', 'Acting game, all ages', array['family-dinner','holiday','reunion','birthday','potluck'], 6, 99, 4, 30, 'both', 'shoestring', null, '[]'::jsonb, '[]'::jsonb, array[]::text[], 50),
  ('white-elephant', 'White elephant gift exchange', 'Gag-gift swap, $20 cap', array['holiday','reunion'], 12, 99, 6, 30, 'both', 'shoestring', null,
    '[{"name":"Gift ($20 cap)","quantity":"1 per person","claimable":true}]'::jsonb,
    '[{"title":"Send gift cap reminder","due_when":"week before","assignable":true}]'::jsonb, array[]::text[], 60),
  ('gratitude-circle', 'Gratitude / wish circle', 'Each person shares one thing, 10-15min', array['holiday','reunion','family-dinner'], 6, 99, 4, 30, 'both', 'shoestring', null, '[]'::jsonb, '[]'::jsonb, array[]::text[], 55),

  -- Outdoor / picnic
  ('lawn-games', 'Lawn games', 'Cornhole, frisbee, ladder toss', array['picnic','reunion','activity-day','housewarming','birthday'], 6, 99, 4, 50, 'outdoor', 'shoestring', null,
    '[{"name":"Lawn game set (cornhole / frisbee / etc.)","quantity":"1-2","claimable":true}]'::jsonb,
    '[{"title":"Borrow or buy game set","due_when":"week before","assignable":true}]'::jsonb,
    array['cornhole rental', 'lawn game rental'], 80),
  ('photo-scavenger', 'Photo scavenger hunt', 'Teams find + photograph items', array['picnic','reunion','activity-day'], 8, 99, 6, 30, 'outdoor', 'shoestring', null,
    '[{"name":"Printed scavenger list","quantity":"per team","claimable":true}]'::jsonb,
    '[{"title":"Make scavenger list","due_when":"week before","assignable":true}]'::jsonb, array[]::text[], 70),
  ('water-balloons', 'Water balloon toss', 'Hot-day cool-off, ages 6+', array['picnic','birthday','activity-day'], 6, 99, 4, 40, 'outdoor', 'shoestring', null,
    '[{"name":"Water balloons (200+)","quantity":"1 bag","claimable":true},{"name":"Towels","quantity":"5+","claimable":true}]'::jsonb,
    '[{"title":"Fill water balloons","due_when":"day-of","assignable":true}]'::jsonb, array[]::text[], 65),
  ('hike-walk', 'Group hike / walk', 'Easy 1-2hr nature loop', array['reunion','activity-day','picnic'], 5, 80, 4, 30, 'outdoor', 'shoestring', null,
    '[{"name":"Water bottles","quantity":"per person","claimable":true}]'::jsonb,
    '[{"title":"Pick + scout trail","due_when":"week before","assignable":true}]'::jsonb, array[]::text[], 70),

  -- Vendor categories used at scale
  ('catering', 'Catering', 'Pro caterer for 30+ guests', array['holiday','reunion','housewarming','birthday','activity-day'], 0, 99, 30, 500, 'both', 'comfortable', 'caterer',
    '[]'::jsonb,
    '[{"title":"Get 3 catering quotes","due_when":"6 weeks before","assignable":false},{"title":"Sign caterer contract","due_when":"4 weeks before","assignable":false},{"title":"Confirm final headcount with caterer","due_when":"week before","assignable":false}]'::jsonb,
    array['catering for events', 'corporate caterer near me', 'family event catering'], 95),
  ('tent-rental', 'Tent / canopy rental', 'For 30+ outdoor guests, sun + rain', array['picnic','reunion','birthday','holiday'], 0, 99, 30, 500, 'outdoor', 'comfortable', 'tent-rental',
    '[]'::jsonb,
    '[{"title":"Book tent rental","due_when":"4-6 weeks before","assignable":false},{"title":"Confirm setup time","due_when":"week before","assignable":false}]'::jsonb,
    array['party tent rental', 'event canopy rental near me'], 90),
  ('table-chair-rental', 'Table + chair rental', 'For 20+ where you don''t own enough', array['picnic','reunion','birthday','holiday','housewarming'], 0, 99, 20, 500, 'both', 'modest', 'rental-furniture',
    '[]'::jsonb,
    '[{"title":"Reserve tables/chairs","due_when":"3-4 weeks before","assignable":false}]'::jsonb,
    array['table and chair rental', 'event table rental'], 80),
  ('porta-potty', 'Porta-potty rental', 'Outdoor 25+ events without nearby restrooms', array['picnic','reunion','activity-day'], 0, 99, 25, 500, 'outdoor', 'modest', 'porta-potty',
    '[]'::jsonb,
    '[{"title":"Book porta-potty","due_when":"3 weeks before","assignable":false}]'::jsonb,
    array['porta potty rental', 'portable restroom rental'], 75),

  -- Atmosphere always-available
  ('playlist', 'Curated playlist', 'Pre-built Spotify / Apple Music vibe', array['family-dinner','holiday','reunion','housewarming','potluck','birthday','picnic'], 0, 99, 2, 200, 'both', 'shoestring', null,
    '[{"name":"Bluetooth speaker","quantity":"1","claimable":true}]'::jsonb,
    '[{"title":"Curate playlist (60-90min)","due_when":"week before","assignable":true}]'::jsonb,
    array[]::text[], 50),
  ('dietary-cards', 'Dietary labels for dishes', 'Tents / cards labeling allergens', array['holiday','reunion','housewarming','potluck'], 0, 99, 8, 200, 'both', 'shoestring', null,
    '[{"name":"Index cards + markers","quantity":"per dish","claimable":true}]'::jsonb,
    '[{"title":"Make dietary labels","due_when":"day-of","assignable":true}]'::jsonb,
    array[]::text[], 70)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  archetypes = excluded.archetypes,
  age_min = excluded.age_min,
  age_max = excluded.age_max,
  group_size_min = excluded.group_size_min,
  group_size_max = excluded.group_size_max,
  venue = excluded.venue,
  budget_tier = excluded.budget_tier,
  vendor_category = excluded.vendor_category,
  default_supplies = excluded.default_supplies,
  suggested_tasks = excluded.suggested_tasks,
  search_terms = excluded.search_terms,
  weight = excluded.weight;

-- ─── 4. catalog lookup RPC ────────────────────────────────────────────────
-- Pure SQL lookup — zero AI cost. Returns rows that match the filters
-- ordered by weight descending. Used by the engine's deterministic phase.

create or replace function public.match_event_activities(
  p_archetype text,
  p_headcount int default 0,
  p_kid_count int default 0,
  p_venue text default null,
  p_budget_tier text default null
)
returns setof public.event_activity_catalog
language sql
security definer
stable
set search_path = ''
as $$
  select c.*
  from public.event_activity_catalog c
  where (cardinality(c.archetypes) = 0 or p_archetype = any(c.archetypes))
    and (c.group_size_min is null or p_headcount >= c.group_size_min)
    and (c.group_size_max is null or p_headcount <= c.group_size_max)
    and (c.venue is null or p_venue is null or c.venue = p_venue or c.venue = 'both')
    and (c.budget_tier is null or p_budget_tier is null
         or array_position(array['shoestring','modest','comfortable','premium'], c.budget_tier)
            <= array_position(array['shoestring','modest','comfortable','premium'], p_budget_tier))
    and (
      p_kid_count = 0
      or c.age_min is null
      or c.age_min <= 14  -- has any kid-friendly age band
    )
  order by c.weight desc nulls last, c.name asc
$$;

grant execute on function public.match_event_activities(text, int, int, text, text) to authenticated;

notify pgrst, 'reload schema';
