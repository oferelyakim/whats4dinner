-- Fix recipe share creation (RLS issue)
create or replace function public.create_recipe_share(p_recipe_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  -- Check ownership
  if not exists (select 1 from public.recipes where id = p_recipe_id and created_by = auth.uid()) then
    raise exception 'You can only share your own recipes';
  end if;

  -- Return existing share if one exists
  select share_code into v_code from public.recipe_shares
  where recipe_id = p_recipe_id and created_by = auth.uid();

  if v_code is not null then
    return v_code;
  end if;

  -- Create new share
  insert into public.recipe_shares (recipe_id, created_by)
  values (p_recipe_id, auth.uid())
  returning share_code into v_code;

  return v_code;
end;
$$;

-- Seed common ingredients as global items
-- These serve as autocomplete suggestions for all users
create table if not exists public.common_ingredients (
  id serial primary key,
  name text not null unique,
  name_he text,
  category text not null default 'Other',
  default_unit text not null default ''
);

-- Fruits
insert into public.common_ingredients (name, name_he, category) values
  ('Apple', 'תפוח', 'Produce'),
  ('Banana', 'בננה', 'Produce'),
  ('Orange', 'תפוז', 'Produce'),
  ('Lemon', 'לימון', 'Produce'),
  ('Lime', 'ליים', 'Produce'),
  ('Strawberry', 'תות', 'Produce'),
  ('Blueberry', 'אוכמנית', 'Produce'),
  ('Grape', 'ענב', 'Produce'),
  ('Avocado', 'אבוקדו', 'Produce'),
  ('Mango', 'מנגו', 'Produce'),
  ('Pineapple', 'אננס', 'Produce'),
  ('Watermelon', 'אבטיח', 'Produce'),
  ('Peach', 'אפרסק', 'Produce'),
  ('Pear', 'אגס', 'Produce'),
  ('Coconut', 'קוקוס', 'Produce')
on conflict (name) do nothing;

-- Vegetables
insert into public.common_ingredients (name, name_he, category) values
  ('Tomato', 'עגבנייה', 'Produce'),
  ('Onion', 'בצל', 'Produce'),
  ('Garlic', 'שום', 'Produce'),
  ('Potato', 'תפוח אדמה', 'Produce'),
  ('Sweet potato', 'בטטה', 'Produce'),
  ('Carrot', 'גזר', 'Produce'),
  ('Cucumber', 'מלפפון', 'Produce'),
  ('Bell pepper', 'פלפל', 'Produce'),
  ('Broccoli', 'ברוקולי', 'Produce'),
  ('Cauliflower', 'כרובית', 'Produce'),
  ('Spinach', 'תרד', 'Produce'),
  ('Lettuce', 'חסה', 'Produce'),
  ('Corn', 'תירס', 'Produce'),
  ('Mushroom', 'פטריות', 'Produce'),
  ('Zucchini', 'קישוא', 'Produce'),
  ('Eggplant', 'חציל', 'Produce'),
  ('Celery', 'סלרי', 'Produce'),
  ('Green beans', 'שעועית ירוקה', 'Produce'),
  ('Peas', 'אפונה', 'Produce'),
  ('Cabbage', 'כרוב', 'Produce'),
  ('Kale', 'קייל', 'Produce'),
  ('Ginger', 'ג׳ינג׳ר', 'Produce'),
  ('Jalapeño', 'חלפיניו', 'Produce'),
  ('Cilantro', 'כוסברה', 'Produce'),
  ('Parsley', 'פטרוזיליה', 'Produce'),
  ('Basil', 'בזיליקום', 'Produce'),
  ('Mint', 'נענע', 'Produce'),
  ('Dill', 'שמיר', 'Produce'),
  ('Scallion', 'בצל ירוק', 'Produce')
on conflict (name) do nothing;

-- Dairy
insert into public.common_ingredients (name, name_he, category) values
  ('Milk', 'חלב', 'Dairy'),
  ('Butter', 'חמאה', 'Dairy'),
  ('Cream', 'שמנת', 'Dairy'),
  ('Sour cream', 'שמנת חמוצה', 'Dairy'),
  ('Cream cheese', 'גבינת שמנת', 'Dairy'),
  ('Yogurt', 'יוגורט', 'Dairy'),
  ('Cheddar cheese', 'צ׳דר', 'Dairy'),
  ('Mozzarella', 'מוצרלה', 'Dairy'),
  ('Parmesan', 'פרמזן', 'Dairy'),
  ('Feta cheese', 'גבינת פטה', 'Dairy'),
  ('Cottage cheese', 'קוטג׳', 'Dairy'),
  ('Eggs', 'ביצים', 'Eggs')
on conflict (name) do nothing;

-- Meat & Seafood
insert into public.common_ingredients (name, name_he, category) values
  ('Chicken breast', 'חזה עוף', 'Meat & Seafood'),
  ('Chicken thigh', 'ירך עוף', 'Meat & Seafood'),
  ('Ground beef', 'בשר טחון', 'Meat & Seafood'),
  ('Beef steak', 'סטייק', 'Meat & Seafood'),
  ('Pork chop', 'צלע חזיר', 'Meat & Seafood'),
  ('Bacon', 'בייקון', 'Meat & Seafood'),
  ('Salmon', 'סלמון', 'Meat & Seafood'),
  ('Tuna', 'טונה', 'Meat & Seafood'),
  ('Shrimp', 'שרימפס', 'Meat & Seafood'),
  ('Turkey', 'הודו', 'Meat & Seafood'),
  ('Lamb', 'כבש', 'Meat & Seafood')
on conflict (name) do nothing;

-- Pantry staples
insert into public.common_ingredients (name, name_he, category) values
  ('Olive oil', 'שמן זית', 'Condiments & Sauces'),
  ('Vegetable oil', 'שמן צמחי', 'Condiments & Sauces'),
  ('Salt', 'מלח', 'Spices & Seasonings'),
  ('Black pepper', 'פלפל שחור', 'Spices & Seasonings'),
  ('Sugar', 'סוכר', 'Baking'),
  ('Brown sugar', 'סוכר חום', 'Baking'),
  ('All-purpose flour', 'קמח', 'Baking'),
  ('Baking powder', 'אבקת אפייה', 'Baking'),
  ('Baking soda', 'סודה לשתייה', 'Baking'),
  ('Vanilla extract', 'תמצית וניל', 'Baking'),
  ('Soy sauce', 'רוטב סויה', 'Condiments & Sauces'),
  ('Vinegar', 'חומץ', 'Condiments & Sauces'),
  ('Ketchup', 'קטשופ', 'Condiments & Sauces'),
  ('Mustard', 'חרדל', 'Condiments & Sauces'),
  ('Mayonnaise', 'מיונז', 'Condiments & Sauces'),
  ('Hot sauce', 'רוטב חריף', 'Condiments & Sauces'),
  ('Honey', 'דבש', 'Condiments & Sauces'),
  ('Maple syrup', 'סירופ מייפל', 'Condiments & Sauces'),
  ('Tahini', 'טחינה', 'Condiments & Sauces')
on conflict (name) do nothing;

-- Grains & Pasta
insert into public.common_ingredients (name, name_he, category) values
  ('Rice', 'אורז', 'Pasta & Rice'),
  ('Pasta', 'פסטה', 'Pasta & Rice'),
  ('Spaghetti', 'ספגטי', 'Pasta & Rice'),
  ('Penne', 'פנה', 'Pasta & Rice'),
  ('Fusilli', 'פוזילי', 'Pasta & Rice'),
  ('Noodles', 'נודלס', 'Pasta & Rice'),
  ('Bread', 'לחם', 'Bakery'),
  ('Tortilla', 'טורטייה', 'Bakery'),
  ('Pita', 'פיתה', 'Bakery'),
  ('Breadcrumbs', 'פירורי לחם', 'Bakery'),
  ('Oats', 'שיבולת שועל', 'Cereal & Breakfast'),
  ('Quinoa', 'קינואה', 'Pasta & Rice'),
  ('Couscous', 'קוסקוס', 'Pasta & Rice')
on conflict (name) do nothing;

-- Canned & Frozen
insert into public.common_ingredients (name, name_he, category) values
  ('Canned tomatoes', 'עגבניות משומרות', 'Canned Goods'),
  ('Tomato paste', 'רסק עגבניות', 'Canned Goods'),
  ('Coconut milk', 'חלב קוקוס', 'Canned Goods'),
  ('Chickpeas', 'חומוס', 'Canned Goods'),
  ('Black beans', 'שעועית שחורה', 'Canned Goods'),
  ('Lentils', 'עדשים', 'Canned Goods'),
  ('Corn (canned)', 'תירס משומר', 'Canned Goods'),
  ('Tuna (canned)', 'טונה משומרת', 'Canned Goods')
on conflict (name) do nothing;

-- Spices
insert into public.common_ingredients (name, name_he, category) values
  ('Cumin', 'כמון', 'Spices & Seasonings'),
  ('Paprika', 'פפריקה', 'Spices & Seasonings'),
  ('Turmeric', 'כורכום', 'Spices & Seasonings'),
  ('Cinnamon', 'קינמון', 'Spices & Seasonings'),
  ('Oregano', 'אורגנו', 'Spices & Seasonings'),
  ('Thyme', 'טימין', 'Spices & Seasonings'),
  ('Rosemary', 'רוזמרין', 'Spices & Seasonings'),
  ('Bay leaves', 'עלי דפנה', 'Spices & Seasonings'),
  ('Chili powder', 'אבקת צ׳ילי', 'Spices & Seasonings'),
  ('Garlic powder', 'אבקת שום', 'Spices & Seasonings'),
  ('Onion powder', 'אבקת בצל', 'Spices & Seasonings'),
  ('Garam masala', 'גראם מסאלה', 'Spices & Seasonings'),
  ('Nutmeg', 'אגוז מוסקט', 'Spices & Seasonings')
on conflict (name) do nothing;

-- Snacks & Beverages
insert into public.common_ingredients (name, name_he, category) values
  ('Chocolate', 'שוקולד', 'Snacks'),
  ('Nuts', 'אגוזים', 'Snacks'),
  ('Almonds', 'שקדים', 'Snacks'),
  ('Walnuts', 'אגוזי מלך', 'Snacks'),
  ('Peanut butter', 'חמאת בוטנים', 'Snacks'),
  ('Coffee', 'קפה', 'Beverages'),
  ('Tea', 'תה', 'Beverages'),
  ('Juice', 'מיץ', 'Beverages'),
  ('Water', 'מים', 'Beverages')
on conflict (name) do nothing;

-- Allow public read on common ingredients (no auth needed)
alter table public.common_ingredients enable row level security;
create policy "Anyone can read common ingredients"
  on public.common_ingredients for select
  using (true);

notify pgrst, 'reload schema';
