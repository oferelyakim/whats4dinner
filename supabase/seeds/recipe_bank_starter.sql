-- v1.17.0 starter seed for recipe_bank.
-- 12 hand-crafted recipes proving the bank → engine path. Run via:
--   npx supabase db query --linked -f supabase/seeds/recipe_bank_starter.sql
-- The full ~50-recipe seeder lives in scripts/seed-recipe-bank.mjs and
-- requires ANTHROPIC_API_KEY in env.

INSERT INTO public.recipe_bank
  (title, cuisine_id, meal_type, slot_role, dietary_tags, ingredient_main, protein_family, ingredients, steps, prep_time_min, cook_time_min, servings, source_kind, quality_score)
VALUES
  ('Sheet-Pan Lemon Garlic Chicken Thighs',
   'american', 'dinner', 'main', ARRAY['gluten-free']::text[],
   'chicken thighs', 'chicken',
   '[{"item":"bone-in chicken thighs","quantity":"6"},{"item":"lemon, sliced","quantity":"1"},{"item":"garlic, minced","quantity":"4 cloves"},{"item":"olive oil","quantity":"3 tbsp"},{"item":"fresh thyme","quantity":"1 tbsp"},{"item":"salt and pepper","quantity":"to taste"}]'::jsonb,
   ARRAY['Preheat oven to 425°F.', 'Toss chicken with olive oil, garlic, thyme, salt, pepper.', 'Arrange on sheet pan, top with lemon slices.', 'Roast 30-35 minutes until skin is crisp and juices run clear.', 'Rest 5 minutes before serving.']::text[],
   10, 35, 4, 'composed', 78),

  ('Creamy Tomato Penne with Basil',
   'italian', 'dinner', 'main', ARRAY['vegetarian']::text[],
   'penne pasta', 'cheese',
   '[{"item":"penne pasta","quantity":"1 lb"},{"item":"crushed tomatoes","quantity":"28 oz"},{"item":"heavy cream","quantity":"1/2 cup"},{"item":"garlic, minced","quantity":"3 cloves"},{"item":"fresh basil, torn","quantity":"1/2 cup"},{"item":"parmesan, grated","quantity":"1/2 cup"},{"item":"olive oil","quantity":"2 tbsp"},{"item":"salt","quantity":"to taste"}]'::jsonb,
   ARRAY['Cook penne in salted boiling water until al dente.', 'Sauté garlic in olive oil 1 minute.', 'Add tomatoes, simmer 10 minutes, stir in cream.', 'Toss with drained pasta, basil, parmesan.', 'Season and serve.']::text[],
   5, 20, 4, 'composed', 75),

  ('Black Bean Tacos with Lime Crema',
   'mexican', 'dinner', 'main', ARRAY['vegetarian']::text[],
   'black beans', 'legume',
   '[{"item":"black beans, drained","quantity":"2 cans"},{"item":"corn tortillas","quantity":"8"},{"item":"red onion, diced","quantity":"1/2"},{"item":"sour cream","quantity":"1/2 cup"},{"item":"lime","quantity":"1"},{"item":"cumin","quantity":"1 tsp"},{"item":"smoked paprika","quantity":"1 tsp"},{"item":"cilantro","quantity":"1/4 cup"}]'::jsonb,
   ARRAY['Warm beans with cumin and paprika in a skillet, mash slightly.', 'Mix sour cream with lime zest and juice for crema.', 'Warm tortillas in dry skillet 30 seconds per side.', 'Fill tortillas with beans, top with onion, cilantro, crema.']::text[],
   10, 15, 4, 'composed', 72),

  ('Thai Basil Tofu Stir-Fry',
   'thai', 'dinner', 'main', ARRAY['vegan','gluten-free']::text[],
   'firm tofu', 'tofu',
   '[{"item":"firm tofu, cubed","quantity":"14 oz"},{"item":"thai basil leaves","quantity":"1 cup"},{"item":"garlic, minced","quantity":"4 cloves"},{"item":"thai chili, chopped","quantity":"1-2"},{"item":"tamari","quantity":"3 tbsp"},{"item":"brown sugar","quantity":"1 tbsp"},{"item":"avocado oil","quantity":"3 tbsp"},{"item":"jasmine rice","quantity":"to serve"}]'::jsonb,
   ARRAY['Press tofu, cube, pat dry.', 'Heat oil in wok, fry tofu until golden 6-8 minutes.', 'Add garlic and chili, stir 30 seconds.', 'Add tamari and brown sugar, toss to coat.', 'Off heat, fold in basil. Serve with rice.']::text[],
   15, 12, 3, 'composed', 80),

  ('Indian Chickpea Curry (Chana Masala)',
   'indian', 'dinner', 'main', ARRAY['vegan','gluten-free']::text[],
   'chickpeas', 'legume',
   '[{"item":"chickpeas, drained","quantity":"2 cans"},{"item":"onion, diced","quantity":"1"},{"item":"tomato, diced","quantity":"2"},{"item":"ginger-garlic paste","quantity":"2 tbsp"},{"item":"garam masala","quantity":"2 tsp"},{"item":"turmeric","quantity":"1/2 tsp"},{"item":"cumin","quantity":"1 tsp"},{"item":"coconut oil","quantity":"2 tbsp"},{"item":"salt","quantity":"to taste"},{"item":"basmati rice","quantity":"to serve"}]'::jsonb,
   ARRAY['Sauté onion in oil 6-8 minutes until golden.', 'Add ginger-garlic paste and spices, stir 1 minute.', 'Add tomatoes, cook until they break down, 6 minutes.', 'Add chickpeas with 1/2 cup water, simmer 15 minutes.', 'Season and serve with basmati rice.']::text[],
   10, 30, 4, 'composed', 82),

  ('Garlic Roasted Broccoli',
   'american', 'dinner', 'veg_side', ARRAY['vegan','gluten-free']::text[],
   'broccoli', NULL,
   '[{"item":"broccoli florets","quantity":"2 lbs"},{"item":"olive oil","quantity":"3 tbsp"},{"item":"garlic, minced","quantity":"4 cloves"},{"item":"red pepper flakes","quantity":"1/2 tsp"},{"item":"lemon zest","quantity":"1 tsp"},{"item":"salt","quantity":"to taste"}]'::jsonb,
   ARRAY['Preheat oven to 425°F.', 'Toss broccoli with oil, garlic, pepper flakes, salt.', 'Spread on sheet pan, roast 18-22 minutes until crispy edges.', 'Finish with lemon zest. Serve hot.']::text[],
   5, 22, 4, 'composed', 76),

  ('Crispy Smashed Potatoes',
   'american', 'dinner', 'starch_side', ARRAY['vegetarian','gluten-free']::text[],
   'baby potatoes', NULL,
   '[{"item":"baby yukon potatoes","quantity":"2 lbs"},{"item":"olive oil","quantity":"4 tbsp"},{"item":"flaky salt","quantity":"to taste"},{"item":"rosemary","quantity":"2 tbsp, chopped"},{"item":"garlic powder","quantity":"1 tsp"}]'::jsonb,
   ARRAY['Boil potatoes in salted water 15 minutes until fork-tender.', 'Drain, arrange on oiled sheet pan.', 'Smash each with the bottom of a glass.', 'Drizzle with oil, sprinkle rosemary, garlic, salt.', 'Roast at 450°F for 22-25 minutes until crisp.']::text[],
   5, 40, 6, 'composed', 78),

  ('Italian Risotto Milanese',
   'italian', 'dinner', 'starch_side', ARRAY['vegetarian','gluten-free']::text[],
   'arborio rice', NULL,
   '[{"item":"arborio rice","quantity":"1 1/2 cups"},{"item":"vegetable broth, warm","quantity":"5 cups"},{"item":"shallot, minced","quantity":"1"},{"item":"saffron threads","quantity":"a pinch"},{"item":"white wine","quantity":"1/2 cup"},{"item":"butter","quantity":"3 tbsp"},{"item":"parmesan, grated","quantity":"1/2 cup"}]'::jsonb,
   ARRAY['Steep saffron in 1/2 cup warm broth 5 minutes.', 'Sweat shallot in 1 tbsp butter 3 minutes.', 'Add rice, toast 1 minute, deglaze with wine.', 'Add broth one ladle at a time, stirring constantly, 18-20 minutes.', 'Off heat, stir in saffron broth, remaining butter, parmesan.']::text[],
   5, 30, 4, 'composed', 79),

  ('Classic French Omelette',
   'french', 'breakfast', 'main', ARRAY['vegetarian']::text[],
   'eggs', 'egg',
   '[{"item":"eggs","quantity":"3"},{"item":"butter","quantity":"1 tbsp"},{"item":"chives, snipped","quantity":"1 tbsp"},{"item":"salt and pepper","quantity":"to taste"}]'::jsonb,
   ARRAY['Beat eggs vigorously with salt and pepper until uniform.', 'Melt butter in 8" non-stick pan over medium heat until foamy.', 'Pour eggs in, immediately stir with rubber spatula 20 seconds.', 'Tilt pan, fold one third over center, slide onto plate folding the third side.', 'Top with chives.']::text[],
   2, 4, 1, 'composed', 81),

  ('Greek Yogurt Parfait with Berries',
   'american', 'breakfast', 'main', ARRAY['vegetarian','gluten-free']::text[],
   'greek yogurt', 'cheese',
   '[{"item":"plain greek yogurt","quantity":"1 1/2 cups"},{"item":"mixed berries","quantity":"1 cup"},{"item":"honey","quantity":"2 tbsp"},{"item":"chopped almonds","quantity":"1/4 cup"},{"item":"vanilla extract","quantity":"1/2 tsp"}]'::jsonb,
   ARRAY['Stir vanilla into yogurt.', 'Layer yogurt, berries, almonds, drizzle of honey in glasses.', 'Repeat layers and top with a final almond crunch.']::text[],
   5, 0, 2, 'composed', 70),

  ('Mediterranean Quinoa Bowl',
   'mediterranean', 'lunch', 'main', ARRAY['vegetarian','gluten-free']::text[],
   'quinoa', 'legume',
   '[{"item":"quinoa, cooked","quantity":"2 cups"},{"item":"cherry tomatoes, halved","quantity":"1 cup"},{"item":"cucumber, diced","quantity":"1"},{"item":"feta, crumbled","quantity":"1/2 cup"},{"item":"kalamata olives","quantity":"1/3 cup"},{"item":"red onion, slivered","quantity":"1/4"},{"item":"olive oil","quantity":"3 tbsp"},{"item":"lemon juice","quantity":"2 tbsp"},{"item":"oregano","quantity":"1 tsp"}]'::jsonb,
   ARRAY['Whisk olive oil, lemon, oregano, salt for dressing.', 'In a bowl combine quinoa, tomatoes, cucumber, onion.', 'Top with feta and olives, drizzle dressing, toss gently.']::text[],
   10, 0, 2, 'composed', 77),

  ('Korean Beef Bulgogi Bowl',
   'korean', 'dinner', 'main', ARRAY[]::text[],
   'flank steak', 'beef',
   '[{"item":"flank steak, thinly sliced","quantity":"1 lb"},{"item":"soy sauce","quantity":"1/4 cup"},{"item":"brown sugar","quantity":"2 tbsp"},{"item":"sesame oil","quantity":"1 tbsp"},{"item":"garlic, minced","quantity":"4 cloves"},{"item":"ginger, grated","quantity":"1 tbsp"},{"item":"scallions, sliced","quantity":"3"},{"item":"sesame seeds","quantity":"1 tbsp"},{"item":"jasmine rice","quantity":"to serve"}]'::jsonb,
   ARRAY['Whisk soy, sugar, sesame oil, garlic, ginger for marinade.', 'Toss with sliced beef, marinate 20 minutes.', 'Sear in a hot skillet 4-5 minutes total, working in batches.', 'Top rice with beef, scallions, sesame seeds.']::text[],
   25, 6, 4, 'composed', 80);

-- Verify
SELECT count(*) AS total_recipes,
       array_agg(distinct cuisine_id) AS cuisines,
       array_agg(distinct meal_type) AS meal_types,
       array_agg(distinct slot_role) AS slot_roles
FROM public.recipe_bank;
