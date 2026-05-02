-- Migration 036 — Pantry / leftover reroll RPC (v3.0.0)
--
-- Powers the "I have chicken and broccoli, what can I make?" paid AI hook.
-- Mostly-deterministic SQL (no AI in the hot path) — caller scores by
-- ingredient overlap + diet match + cuisine variety against the recipe bank.
--
-- An optional Haiku rank step lives on the client: if `match_recipes_by_ingredients`
-- returns ≥3 matches, we return the top match; if it returns >5, we hand the
-- top-N back to Anthropic for nuance ranking. The RPC itself is AI-free.
--
-- Idempotent — safe to re-run.

CREATE OR REPLACE FUNCTION public.match_recipes_by_ingredients(
  p_ingredients    text[],
  p_diet           text[]   DEFAULT '{}',
  p_meal_type      text     DEFAULT NULL,
  p_slot_role      text     DEFAULT NULL,
  p_max_prep_min   int      DEFAULT NULL,
  p_limit          int      DEFAULT 5
)
RETURNS TABLE(
  recipe_bank_id    uuid,
  title             text,
  cuisine_id        text,
  dietary_tags      text[],
  ingredient_main   text,
  protein_family   text,
  prep_time_min    int,
  cook_time_min    int,
  servings         int,
  image_url        text,
  source_url       text,
  source_domain    text,
  source_kind_v2   text,
  match_score      numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH pantry AS (
    -- normalize inputs: lowercase + trim
    SELECT lower(trim(unnest(p_ingredients))) AS ing
  ),
  candidates AS (
    SELECT
      rb.id, rb.title, rb.cuisine_id, rb.dietary_tags,
      rb.ingredient_main, rb.protein_family,
      rb.prep_time_min, rb.cook_time_min, rb.servings,
      rb.image_url, rb.source_url, rb.source_domain, rb.source_kind_v2,
      rb.popularity_score,
      -- Score: +3 for main ingredient match, +1 per secondary match.
      (
        CASE WHEN lower(rb.ingredient_main) IN (SELECT ing FROM pantry) THEN 3 ELSE 0 END
        +
        (SELECT COUNT(*) FROM unnest(rb.secondary_ingredients) AS si
         WHERE lower(si) IN (SELECT ing FROM pantry))
      )::numeric AS overlap_score
    FROM public.recipe_bank rb
    WHERE rb.retired_at IS NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
      -- Diet filter: row must contain ALL requested diet tags (superset).
      AND (cardinality(p_diet) = 0 OR rb.dietary_tags @> p_diet)
      -- Meal-type / slot-role filters when provided.
      AND (p_meal_type IS NULL OR rb.meal_type = p_meal_type)
      AND (p_slot_role IS NULL OR rb.slot_role = p_slot_role)
      -- Max prep filter (ignore rows over the cap).
      AND (p_max_prep_min IS NULL
           OR rb.prep_time_min IS NULL
           OR rb.prep_time_min <= p_max_prep_min)
  )
  SELECT
    id, title, cuisine_id, dietary_tags,
    ingredient_main, protein_family,
    prep_time_min, cook_time_min, servings,
    image_url, source_url, source_domain, source_kind_v2,
    -- Final score: overlap weighted heavily, popularity as a tiebreaker.
    (overlap_score * 10 + (popularity_score / 100))::numeric AS match_score
  FROM candidates
  WHERE overlap_score > 0  -- require at least one ingredient match
  ORDER BY overlap_score DESC, popularity_score DESC, random()
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.match_recipes_by_ingredients(text[], text[], text, text, int, int)
  TO authenticated;
