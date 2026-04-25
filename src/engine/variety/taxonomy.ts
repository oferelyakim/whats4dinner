// Replanish meal-engine — variety taxonomy.
//
// Source of truth for every dimension the planner spins on. Pure constants;
// no Dexie, no AI, no side effects. The shape `{ name, family, tags, cuisines }`
// drives filtering (`tags`), sibling-rotation (`family`), and cuisine-aware
// sampling (`cuisines`). Cuisines carry their own signature lists so a Stage A
// envelope can ask "what proteins anchor Korean?" without hardcoding.
//
// Lists were built from the meal-planner expert's recommendations, with
// Mediterranean/Middle-Eastern intentionally capped at 4 cuisines (the
// algorithm cannot cluster on Med/ME by sub-style — that's the user complaint
// being fixed).

export interface Protein {
  name: string
  family: 'poultry' | 'red-meat' | 'pork' | 'seafood' | 'plant-based' | 'eggs-dairy'
  tags: string[]
  cuisines: string[]
}

export interface Veggie {
  name: string
  family:
    | 'cruciferous'
    | 'leafy'
    | 'root'
    | 'gourd'
    | 'allium'
    | 'nightshade'
    | 'podded'
    | 'mushroom'
    | 'sea-veg'
  tags: string[]
  cuisines: string[]
}

export interface Starch {
  name: string
  family: 'rice' | 'noodle' | 'bread' | 'grain' | 'tuber' | 'legume' | 'pasta'
  tags: string[]
  cuisines: string[]
}

export interface Cuisine {
  id: string
  displayName: string
  region:
    | 'east-asia'
    | 'southeast-asia'
    | 'south-asia'
    | 'latin-america'
    | 'north-america'
    | 'europe'
    | 'med-me'
  signatureProteins: string[]
  signatureVeggies: string[]
  signatureStarches: string[]
  signatureFlavors: string[]
  commonStyles: string[]
}

export interface Style {
  id: string
  displayName: string
  characteristics: string
  weekendBias: boolean
}

export interface Flavor {
  id: string
  displayName: string
  characteristics: string
}

// ─── Proteins (33) ─────────────────────────────────────────────────────────

export const PROTEINS: Protein[] = [
  // Poultry (7)
  { name: 'chicken thighs (boneless)', family: 'poultry', tags: ['weeknight', 'budget', 'kid-friendly', 'forgiving'], cuisines: ['american', 'mexican', 'tex-mex', 'thai', 'indian-north', 'indian-south', 'korean', 'japanese', 'filipino', 'french-bistro', 'italian-southern', 'cajun', 'cuban-caribbean', 'peruvian'] },
  { name: 'chicken breast', family: 'poultry', tags: ['weeknight', 'lean', 'kid-friendly'], cuisines: ['american', 'mexican', 'italian-northern', 'french-bistro', 'american-comfort', 'thai', 'vietnamese'] },
  { name: 'whole roast chicken', family: 'poultry', tags: ['weekend', 'batch-cook'], cuisines: ['american', 'french-bistro', 'peruvian', 'italian-northern', 'american-comfort'] },
  { name: 'chicken wings', family: 'poultry', tags: ['weekend', 'party', 'tapas'], cuisines: ['american', 'korean', 'sichuan', 'cajun', 'tex-mex'] },
  { name: 'ground turkey', family: 'poultry', tags: ['weeknight', 'lean', 'budget', 'kid-friendly'], cuisines: ['american', 'tex-mex', 'italian-southern', 'american-comfort', 'thai'] },
  { name: 'ground chicken', family: 'poultry', tags: ['weeknight', 'lean', 'budget'], cuisines: ['thai', 'vietnamese', 'korean', 'tex-mex', 'italian-southern'] },
  { name: 'duck breast', family: 'poultry', tags: ['weekend', 'ambitious', 'date-night'], cuisines: ['french-bistro', 'cantonese', 'sichuan'] },
  // Red meat (6)
  { name: 'flank or skirt steak', family: 'red-meat', tags: ['weeknight', 'grill', 'crowd-pleaser'], cuisines: ['mexican', 'tex-mex', 'argentine', 'korean', 'american', 'vietnamese'] },
  { name: 'ground beef (85/15)', family: 'red-meat', tags: ['weeknight', 'budget', 'kid-friendly'], cuisines: ['american', 'tex-mex', 'italian-southern', 'american-comfort', 'greek'] },
  { name: 'beef chuck (stew/braise)', family: 'red-meat', tags: ['weekend', 'slow-cooker', 'batch-cook'], cuisines: ['french-bistro', 'american-comfort', 'italian-northern', 'german-polish', 'mexican', 'korean'] },
  { name: 'lamb shoulder', family: 'red-meat', tags: ['weekend', 'ambitious', 'braise'], cuisines: ['greek', 'indian-north', 'french-bistro', 'persian'] },
  { name: 'ground lamb', family: 'red-meat', tags: ['weeknight', 'flavor-forward'], cuisines: ['greek', 'indian-north', 'persian', 'italian-southern'] },
  { name: 'ribeye or NY strip steak', family: 'red-meat', tags: ['weekend', 'date-night', 'grill'], cuisines: ['american', 'argentine', 'american-comfort', 'french-bistro', 'korean'] },
  // Pork (5)
  { name: 'pork tenderloin', family: 'pork', tags: ['weeknight', 'lean', 'quick-roast'], cuisines: ['american', 'cantonese', 'french-bistro', 'german-polish', 'cuban-caribbean'] },
  { name: 'pork shoulder', family: 'pork', tags: ['weekend', 'slow-cooker', 'batch-cook'], cuisines: ['mexican', 'tex-mex', 'cuban-caribbean', 'filipino', 'american-bbq', 'cantonese'] },
  { name: 'ground pork', family: 'pork', tags: ['weeknight', 'umami', 'versatile'], cuisines: ['cantonese', 'sichuan', 'vietnamese', 'thai', 'italian-southern', 'filipino'] },
  { name: 'bone-in pork chops', family: 'pork', tags: ['weeknight', 'grill', 'sear'], cuisines: ['american-comfort', 'italian-southern', 'german-polish', 'cuban-caribbean'] },
  { name: 'bacon', family: 'pork', tags: ['accent', 'breakfast', 'umami'], cuisines: ['american', 'american-comfort', 'italian-northern', 'french-bistro', 'german-polish'] },
  // Seafood (7)
  { name: 'salmon fillet', family: 'seafood', tags: ['weeknight', 'lean', 'omega-3', 'kid-friendly'], cuisines: ['american', 'japanese', 'thai', 'french-bistro', 'cajun', 'peruvian'] },
  { name: 'shrimp (peeled)', family: 'seafood', tags: ['weeknight', 'quick', 'frozen-friendly'], cuisines: ['cajun', 'thai', 'vietnamese', 'cantonese', 'italian-southern', 'mexican', 'peruvian', 'spanish-tapas'] },
  { name: 'cod or pollock', family: 'seafood', tags: ['weeknight', 'lean', 'budget', 'kid-friendly'], cuisines: ['american', 'french-bistro', 'italian-southern', 'japanese', 'spanish-tapas'] },
  { name: 'canned tuna', family: 'seafood', tags: ['pantry', 'budget', 'quick', 'no-cook'], cuisines: ['american', 'italian-southern', 'spanish-tapas', 'japanese'] },
  { name: 'tilapia or branzino', family: 'seafood', tags: ['weeknight', 'mild', 'kid-friendly'], cuisines: ['american', 'cantonese', 'spanish-tapas', 'italian-southern', 'greek'] },
  { name: 'mussels or clams', family: 'seafood', tags: ['weekend', 'date-night', 'quick-cook'], cuisines: ['french-bistro', 'italian-southern', 'spanish-tapas', 'thai'] },
  { name: 'canned sardines', family: 'seafood', tags: ['pantry', 'no-cook', 'tapas', 'budget'], cuisines: ['spanish-tapas', 'italian-southern'] },
  // Plant-based (5)
  { name: 'firm tofu', family: 'plant-based', tags: ['weeknight', 'vegan', 'protein-pivot'], cuisines: ['cantonese', 'sichuan', 'japanese', 'korean', 'thai', 'vietnamese'] },
  { name: 'tempeh', family: 'plant-based', tags: ['weeknight', 'vegan', 'umami'], cuisines: ['filipino', 'american', 'thai', 'indian-south'] },
  { name: 'chickpeas (canned)', family: 'plant-based', tags: ['pantry', 'vegan', 'budget', 'kid-friendly'], cuisines: ['indian-north', 'indian-south', 'greek', 'italian-southern', 'spanish-tapas', 'american-comfort'] },
  { name: 'black or pinto beans', family: 'plant-based', tags: ['pantry', 'vegan', 'budget', 'batch-cook'], cuisines: ['mexican', 'tex-mex', 'cuban-caribbean', 'american-bbq', 'american-comfort'] },
  { name: 'lentils (red or green)', family: 'plant-based', tags: ['pantry', 'vegan', 'budget', 'batch-cook'], cuisines: ['indian-north', 'indian-south', 'french-bistro', 'italian-northern'] },
  // Eggs/dairy (3)
  { name: 'eggs', family: 'eggs-dairy', tags: ['anytime', 'budget', 'kid-friendly', 'pantry'], cuisines: ['american', 'french-bistro', 'italian-northern', 'japanese', 'korean', 'mexican', 'cantonese', 'spanish-tapas', 'indian-south'] },
  { name: 'paneer or halloumi', family: 'eggs-dairy', tags: ['vegetarian', 'grill-friendly'], cuisines: ['indian-north', 'greek'] },
  { name: 'fresh ricotta or cottage cheese', family: 'eggs-dairy', tags: ['vegetarian', 'kid-friendly', 'quick'], cuisines: ['italian-northern', 'italian-southern', 'american-comfort'] },
]

// ─── Lead veggies (32) ─────────────────────────────────────────────────────

export const LEAD_VEGGIES: Veggie[] = [
  // Cruciferous (5)
  { name: 'broccoli', family: 'cruciferous', tags: ['weeknight', 'kid-friendly', 'roast', 'steam', 'stir-fry'], cuisines: ['american', 'cantonese', 'italian-southern', 'american-comfort', 'sichuan'] },
  { name: 'cauliflower', family: 'cruciferous', tags: ['roast', 'low-carb', 'versatile'], cuisines: ['indian-north', 'italian-southern', 'american', 'american-bbq'] },
  { name: 'brussels sprouts', family: 'cruciferous', tags: ['roast', 'weekend', 'flavor-forward'], cuisines: ['american', 'french-bistro', 'american-comfort', 'korean'] },
  { name: 'green or napa cabbage', family: 'cruciferous', tags: ['budget', 'sturdy', 'slaw'], cuisines: ['korean', 'german-polish', 'cantonese', 'american-bbq', 'vietnamese', 'filipino'] },
  { name: 'bok choy', family: 'cruciferous', tags: ['quick', 'stir-fry', 'tender'], cuisines: ['cantonese', 'sichuan', 'japanese', 'vietnamese'] },
  // Leafy (4)
  { name: 'baby spinach', family: 'leafy', tags: ['quick', 'no-cook-friendly', 'wilt'], cuisines: ['italian-northern', 'indian-north', 'french-bistro', 'american', 'japanese'] },
  { name: 'lacinato or curly kale', family: 'leafy', tags: ['sturdy', 'salad', 'roast'], cuisines: ['italian-northern', 'american', 'american-comfort'] },
  { name: 'romaine or little gem', family: 'leafy', tags: ['no-cook', 'crisp', 'wrap'], cuisines: ['american', 'mexican', 'korean', 'cantonese', 'greek'] },
  { name: 'swiss chard', family: 'leafy', tags: ['saute', 'sturdy', 'flavor-forward'], cuisines: ['italian-northern', 'italian-southern', 'french-bistro', 'greek'] },
  // Root (5)
  { name: 'carrots', family: 'root', tags: ['budget', 'sturdy', 'kid-friendly', 'roast', 'raw'], cuisines: ['american', 'french-bistro', 'korean', 'japanese', 'vietnamese', 'indian-north'] },
  { name: 'beets', family: 'root', tags: ['roast', 'salad', 'earthy'], cuisines: ['french-bistro', 'italian-northern', 'american', 'german-polish'] },
  { name: 'parsnips', family: 'root', tags: ['roast', 'weekend', 'sweet'], cuisines: ['french-bistro', 'american-comfort', 'german-polish'] },
  { name: 'radishes', family: 'root', tags: ['no-cook', 'crisp', 'accent'], cuisines: ['french-bistro', 'mexican', 'japanese', 'korean'] },
  { name: 'daikon', family: 'root', tags: ['quick-pickle', 'crisp', 'funky'], cuisines: ['japanese', 'korean', 'vietnamese', 'cantonese'] },
  // Gourd (4)
  { name: 'butternut squash', family: 'gourd', tags: ['fall', 'roast', 'kid-friendly'], cuisines: ['american', 'italian-northern', 'french-bistro', 'indian-north'] },
  { name: 'zucchini', family: 'gourd', tags: ['weeknight', 'quick', 'grill'], cuisines: ['italian-southern', 'american', 'french-bistro', 'greek'] },
  { name: 'english or persian cucumber', family: 'gourd', tags: ['no-cook', 'crisp', 'cooling'], cuisines: ['japanese', 'korean', 'greek', 'vietnamese', 'thai', 'american'] },
  { name: 'kabocha or delicata', family: 'gourd', tags: ['fall', 'roast', 'sweet'], cuisines: ['japanese', 'american', 'italian-northern'] },
  // Allium (3)
  { name: 'leeks', family: 'allium', tags: ['braise', 'soup', 'sweet'], cuisines: ['french-bistro', 'italian-northern', 'american-comfort'] },
  { name: 'scallions', family: 'allium', tags: ['accent', 'quick', 'garnish'], cuisines: ['cantonese', 'korean', 'japanese', 'vietnamese', 'thai', 'sichuan'] },
  { name: 'sweet onions', family: 'allium', tags: ['caramelize', 'grill', 'versatile'], cuisines: ['american', 'french-bistro', 'american-comfort', 'american-bbq', 'german-polish'] },
  // Nightshade (5)
  { name: 'bell peppers', family: 'nightshade', tags: ['weeknight', 'kid-friendly', 'crunch', 'roast'], cuisines: ['italian-southern', 'spanish-tapas', 'tex-mex', 'cuban-caribbean', 'american', 'korean'] },
  { name: 'roma or cherry tomatoes', family: 'nightshade', tags: ['quick', 'roast', 'no-cook'], cuisines: ['italian-southern', 'greek', 'spanish-tapas', 'american', 'indian-south', 'mexican'] },
  { name: 'eggplant', family: 'nightshade', tags: ['roast', 'flavor-sponge', 'grill'], cuisines: ['italian-southern', 'sichuan', 'greek', 'thai', 'japanese', 'indian-north'] },
  { name: 'poblano peppers', family: 'nightshade', tags: ['char', 'stuff', 'smoky'], cuisines: ['mexican', 'tex-mex'] },
  { name: 'baby or yukon potatoes', family: 'nightshade', tags: ['roast', 'smash', 'versatile'], cuisines: ['american', 'french-bistro', 'peruvian', 'american-comfort', 'german-polish'] },
  // Podded (3)
  { name: 'green beans', family: 'podded', tags: ['weeknight', 'blanch', 'roast', 'kid-friendly'], cuisines: ['american', 'french-bistro', 'sichuan', 'italian-southern', 'american-comfort'] },
  { name: 'snap or snow peas', family: 'podded', tags: ['quick', 'stir-fry', 'crisp'], cuisines: ['cantonese', 'japanese', 'american', 'thai'] },
  { name: 'edamame', family: 'podded', tags: ['no-cook', 'snack', 'protein-bonus'], cuisines: ['japanese', 'american'] },
  // Mushroom (2)
  { name: 'cremini or button mushrooms', family: 'mushroom', tags: ['umami', 'saute', 'budget'], cuisines: ['italian-northern', 'french-bistro', 'american', 'american-comfort'] },
  { name: 'shiitake', family: 'mushroom', tags: ['umami', 'flavor-forward'], cuisines: ['japanese', 'cantonese', 'korean', 'sichuan', 'vietnamese'] },
  // Sea-veg (1)
  { name: 'nori or wakame', family: 'sea-veg', tags: ['accent', 'umami', 'pantry'], cuisines: ['japanese', 'korean'] },
]

// ─── Lead starches (21) ────────────────────────────────────────────────────

export const STARCHES: Starch[] = [
  // Rice (4)
  { name: 'jasmine rice', family: 'rice', tags: ['weeknight', 'quick', 'kid-friendly', 'gluten-free'], cuisines: ['thai', 'vietnamese', 'cantonese', 'filipino', 'cuban-caribbean'] },
  { name: 'long-grain white rice', family: 'rice', tags: ['weeknight', 'neutral', 'gluten-free'], cuisines: ['american', 'tex-mex', 'mexican', 'cuban-caribbean', 'cajun', 'indian-south'] },
  { name: 'short-grain rice', family: 'rice', tags: ['sticky', 'gluten-free'], cuisines: ['japanese', 'korean'] },
  { name: 'basmati rice', family: 'rice', tags: ['fragrant', 'gluten-free'], cuisines: ['indian-north', 'indian-south', 'persian'] },
  // Noodles (3)
  { name: 'rice noodles', family: 'noodle', tags: ['quick', 'gluten-free'], cuisines: ['vietnamese', 'thai', 'cantonese'] },
  { name: 'egg noodles or ramen', family: 'noodle', tags: ['quick', 'slurpy'], cuisines: ['cantonese', 'japanese', 'sichuan'] },
  { name: 'soba (buckwheat)', family: 'noodle', tags: ['no-cook-friendly', 'nutty'], cuisines: ['japanese'] },
  // Bread (3)
  { name: 'corn or flour tortillas', family: 'bread', tags: ['weeknight', 'wrap', 'kid-friendly'], cuisines: ['mexican', 'tex-mex'] },
  { name: 'crusty baguette or sourdough', family: 'bread', tags: ['no-cook', 'crowd-pleaser'], cuisines: ['french-bistro', 'italian-northern', 'italian-southern', 'spanish-tapas', 'american'] },
  { name: 'pita or naan', family: 'bread', tags: ['wrap', 'dip-friendly'], cuisines: ['greek', 'indian-north', 'persian'] },
  // Grain (4)
  { name: 'quinoa', family: 'grain', tags: ['weeknight', 'gluten-free', 'protein-bonus'], cuisines: ['american', 'peruvian'] },
  { name: 'farro or pearled barley', family: 'grain', tags: ['hearty', 'batch-cook'], cuisines: ['italian-northern', 'american-comfort'] },
  { name: 'polenta', family: 'grain', tags: ['creamy', 'gluten-free', 'comfort'], cuisines: ['italian-northern', 'italian-southern', 'american-comfort'] },
  { name: 'grits', family: 'grain', tags: ['breakfast', 'comfort', 'gluten-free'], cuisines: ['american-comfort', 'cajun'] },
  // Tuber (3)
  { name: 'russet potatoes', family: 'tuber', tags: ['kid-friendly', 'versatile', 'gluten-free'], cuisines: ['american', 'french-bistro', 'american-comfort', 'german-polish', 'peruvian'] },
  { name: 'sweet potatoes', family: 'tuber', tags: ['roast', 'sweet', 'gluten-free', 'kid-friendly'], cuisines: ['american', 'american-bbq', 'filipino', 'korean', 'american-comfort'] },
  { name: 'yuca / cassava', family: 'tuber', tags: ['hearty', 'gluten-free'], cuisines: ['cuban-caribbean', 'filipino'] },
  // Legume (2)
  { name: 'black beans (as side)', family: 'legume', tags: ['budget', 'vegan', 'gluten-free'], cuisines: ['mexican', 'tex-mex', 'cuban-caribbean', 'american-bbq'] },
  { name: 'cooked lentils (as side)', family: 'legume', tags: ['vegan', 'batch-cook', 'gluten-free'], cuisines: ['indian-north', 'indian-south', 'french-bistro'] },
  // Pasta (2)
  { name: 'short pasta', family: 'pasta', tags: ['weeknight', 'kid-friendly', 'crowd-pleaser'], cuisines: ['italian-northern', 'italian-southern', 'american-comfort'] },
  { name: 'long pasta', family: 'pasta', tags: ['weeknight', 'classic'], cuisines: ['italian-southern', 'italian-northern', 'american-comfort'] },
]

// ─── Cuisines (25 — Med/ME hard-capped at 4) ───────────────────────────────

export const CUISINES: Cuisine[] = [
  // East Asia (4)
  { id: 'cantonese', displayName: 'Cantonese', region: 'east-asia', signatureProteins: ['pork shoulder', 'shrimp (peeled)', 'firm tofu', 'ground pork', 'duck breast', 'eggs'], signatureVeggies: ['bok choy', 'snap or snow peas', 'shiitake', 'daikon', 'scallions'], signatureStarches: ['jasmine rice', 'egg noodles or ramen', 'rice noodles'], signatureFlavors: ['umami-heavy', 'garlicky', 'sweet-savory'], commonStyles: ['stir-fry', 'rice-bowl', 'soup-stew'] },
  { id: 'sichuan', displayName: 'Sichuan', region: 'east-asia', signatureProteins: ['ground pork', 'firm tofu', 'chicken thighs (boneless)', 'chicken wings'], signatureVeggies: ['eggplant', 'green beans', 'shiitake', 'scallions'], signatureStarches: ['jasmine rice', 'egg noodles or ramen'], signatureFlavors: ['spicy-hot', 'peppery-mild', 'umami-heavy', 'fermented'], commonStyles: ['stir-fry', 'braised'] },
  { id: 'japanese', displayName: 'Japanese', region: 'east-asia', signatureProteins: ['salmon fillet', 'firm tofu', 'eggs', 'cod or pollock'], signatureVeggies: ['bok choy', 'daikon', 'english or persian cucumber', 'shiitake', 'kabocha or delicata', 'nori or wakame'], signatureStarches: ['short-grain rice', 'soba (buckwheat)', 'egg noodles or ramen'], signatureFlavors: ['umami-heavy', 'bright-citrusy', 'fermented'], commonStyles: ['grilled', 'rice-bowl', 'no-cook-salad', 'soup-stew'] },
  { id: 'korean', displayName: 'Korean', region: 'east-asia', signatureProteins: ['flank or skirt steak', 'chicken thighs (boneless)', 'firm tofu', 'chicken wings', 'pork shoulder'], signatureVeggies: ['green or napa cabbage', 'scallions', 'english or persian cucumber', 'daikon'], signatureStarches: ['short-grain rice', 'sweet potatoes', 'egg noodles or ramen'], signatureFlavors: ['fermented', 'spicy-hot', 'umami-heavy', 'sweet-savory'], commonStyles: ['grilled', 'tapas', 'rice-bowl'] },
  // Southeast Asia (3)
  { id: 'thai', displayName: 'Thai', region: 'southeast-asia', signatureProteins: ['chicken thighs (boneless)', 'shrimp (peeled)', 'firm tofu', 'ground chicken', 'salmon fillet'], signatureVeggies: ['bell peppers', 'eggplant', 'english or persian cucumber', 'snap or snow peas'], signatureStarches: ['jasmine rice', 'rice noodles'], signatureFlavors: ['bright-citrusy', 'spicy-hot', 'sweet-savory', 'herby'], commonStyles: ['curry', 'stir-fry', 'no-cook-salad'] },
  { id: 'vietnamese', displayName: 'Vietnamese', region: 'southeast-asia', signatureProteins: ['flank or skirt steak', 'shrimp (peeled)', 'chicken breast', 'ground pork'], signatureVeggies: ['english or persian cucumber', 'romaine or little gem', 'daikon', 'carrots', 'scallions'], signatureStarches: ['rice noodles', 'jasmine rice'], signatureFlavors: ['bright-citrusy', 'herby', 'vinegary', 'umami-heavy'], commonStyles: ['rice-bowl', 'grilled', 'no-cook-salad', 'sandwich'] },
  { id: 'filipino', displayName: 'Filipino', region: 'southeast-asia', signatureProteins: ['pork shoulder', 'chicken thighs (boneless)', 'tempeh'], signatureVeggies: ['green or napa cabbage', 'bok choy'], signatureStarches: ['jasmine rice', 'sweet potatoes', 'yuca / cassava'], signatureFlavors: ['vinegary', 'sweet-savory', 'umami-heavy', 'garlicky'], commonStyles: ['braised', 'rice-bowl', 'grilled'] },
  // South Asia (2)
  { id: 'indian-north', displayName: 'Indian (North)', region: 'south-asia', signatureProteins: ['chicken thighs (boneless)', 'lamb shoulder', 'ground lamb', 'chickpeas (canned)', 'paneer or halloumi', 'lentils (red or green)'], signatureVeggies: ['cauliflower', 'baby spinach', 'butternut squash', 'eggplant', 'carrots'], signatureStarches: ['basmati rice', 'pita or naan', 'cooked lentils (as side)'], signatureFlavors: ['creamy-rich', 'spicy-hot', 'herby', 'umami-heavy'], commonStyles: ['curry', 'grilled', 'rice-bowl'] },
  { id: 'indian-south', displayName: 'Indian (South)', region: 'south-asia', signatureProteins: ['lentils (red or green)', 'tempeh', 'eggs', 'chickpeas (canned)', 'salmon fillet'], signatureVeggies: ['roma or cherry tomatoes', 'baby spinach', 'green beans', 'cauliflower'], signatureStarches: ['basmati rice', 'long-grain white rice'], signatureFlavors: ['spicy-hot', 'bright-citrusy', 'herby', 'vinegary'], commonStyles: ['curry', 'rice-bowl', 'soup-stew'] },
  // Latin America (5)
  { id: 'mexican', displayName: 'Mexican', region: 'latin-america', signatureProteins: ['flank or skirt steak', 'pork shoulder', 'chicken thighs (boneless)', 'black or pinto beans', 'eggs', 'shrimp (peeled)'], signatureVeggies: ['poblano peppers', 'bell peppers', 'romaine or little gem', 'roma or cherry tomatoes'], signatureStarches: ['corn or flour tortillas', 'long-grain white rice', 'black beans (as side)'], signatureFlavors: ['bright-citrusy', 'smoky', 'herby', 'spicy-hot'], commonStyles: ['taco-wrap', 'grilled', 'rice-bowl', 'braised'] },
  { id: 'tex-mex', displayName: 'Tex-Mex', region: 'latin-america', signatureProteins: ['ground beef (85/15)', 'ground turkey', 'chicken breast', 'black or pinto beans'], signatureVeggies: ['bell peppers', 'poblano peppers', 'romaine or little gem'], signatureStarches: ['corn or flour tortillas', 'long-grain white rice', 'black beans (as side)'], signatureFlavors: ['smoky', 'spicy-hot', 'creamy-rich', 'sweet-savory'], commonStyles: ['taco-wrap', 'sheet-pan', 'rice-bowl'] },
  { id: 'cuban-caribbean', displayName: 'Cuban / Caribbean', region: 'latin-america', signatureProteins: ['pork shoulder', 'chicken thighs (boneless)', 'black or pinto beans', 'pork tenderloin', 'bone-in pork chops'], signatureVeggies: ['bell peppers', 'sweet onions'], signatureStarches: ['long-grain white rice', 'yuca / cassava', 'sweet potatoes', 'black beans (as side)'], signatureFlavors: ['bright-citrusy', 'garlicky', 'sweet-savory', 'herby'], commonStyles: ['braised', 'grilled', 'rice-bowl', 'sandwich'] },
  { id: 'peruvian', displayName: 'Peruvian', region: 'latin-america', signatureProteins: ['chicken thighs (boneless)', 'whole roast chicken', 'salmon fillet', 'shrimp (peeled)'], signatureVeggies: ['romaine or little gem', 'baby or yukon potatoes', 'english or persian cucumber'], signatureStarches: ['quinoa', 'long-grain white rice', 'russet potatoes'], signatureFlavors: ['bright-citrusy', 'spicy-hot', 'herby', 'vinegary'], commonStyles: ['grilled', 'no-cook-salad', 'rice-bowl'] },
  { id: 'argentine', displayName: 'Argentine', region: 'latin-america', signatureProteins: ['flank or skirt steak', 'ribeye or NY strip steak', 'chicken thighs (boneless)'], signatureVeggies: ['bell peppers', 'sweet onions', 'romaine or little gem', 'roma or cherry tomatoes'], signatureStarches: ['russet potatoes', 'crusty baguette or sourdough', 'short pasta'], signatureFlavors: ['herby', 'smoky', 'garlicky', 'peppery-mild'], commonStyles: ['grilled', 'sandwich', 'no-cook-salad'] },
  // North America (4)
  { id: 'american', displayName: 'American (modern)', region: 'north-america', signatureProteins: ['chicken breast', 'salmon fillet', 'ground turkey', 'eggs', 'shrimp (peeled)'], signatureVeggies: ['broccoli', 'baby or yukon potatoes', 'green beans', 'romaine or little gem', 'butternut squash'], signatureStarches: ['short pasta', 'quinoa', 'russet potatoes', 'sweet potatoes'], signatureFlavors: ['herby', 'garlicky', 'peppery-mild', 'smoky'], commonStyles: ['sheet-pan', 'grilled', 'rice-bowl', 'no-cook-salad'] },
  { id: 'american-comfort', displayName: 'American Comfort', region: 'north-america', signatureProteins: ['ground beef (85/15)', 'whole roast chicken', 'beef chuck (stew/braise)', 'bone-in pork chops', 'bacon'], signatureVeggies: ['carrots', 'sweet onions', 'green beans', 'cremini or button mushrooms', 'lacinato or curly kale'], signatureStarches: ['russet potatoes', 'short pasta', 'grits', 'crusty baguette or sourdough'], signatureFlavors: ['creamy-rich', 'umami-heavy', 'herby'], commonStyles: ['braised', 'sheet-pan', 'soup-stew', 'sandwich'] },
  { id: 'american-bbq', displayName: 'BBQ / Southern', region: 'north-america', signatureProteins: ['pork shoulder', 'chicken wings', 'chicken thighs (boneless)', 'bone-in pork chops', 'black or pinto beans'], signatureVeggies: ['green or napa cabbage', 'sweet onions', 'cauliflower', 'sweet potatoes'], signatureStarches: ['russet potatoes', 'sweet potatoes', 'grits', 'black beans (as side)'], signatureFlavors: ['smoky', 'sweet-savory', 'vinegary'], commonStyles: ['grilled', 'sheet-pan', 'braised'] },
  { id: 'cajun', displayName: 'Cajun / Creole', region: 'north-america', signatureProteins: ['shrimp (peeled)', 'chicken thighs (boneless)', 'salmon fillet', 'chicken wings'], signatureVeggies: ['bell peppers', 'sweet onions'], signatureStarches: ['long-grain white rice', 'grits'], signatureFlavors: ['spicy-hot', 'smoky', 'herby', 'peppery-mild'], commonStyles: ['soup-stew', 'sheet-pan', 'rice-bowl'] },
  // Europe (4)
  { id: 'french-bistro', displayName: 'French Bistro', region: 'europe', signatureProteins: ['whole roast chicken', 'beef chuck (stew/braise)', 'salmon fillet', 'duck breast', 'mussels or clams', 'lentils (red or green)'], signatureVeggies: ['leeks', 'carrots', 'cremini or button mushrooms', 'baby or yukon potatoes', 'swiss chard'], signatureStarches: ['crusty baguette or sourdough', 'russet potatoes', 'short pasta'], signatureFlavors: ['creamy-rich', 'herby', 'umami-heavy'], commonStyles: ['braised', 'sheet-pan', 'no-cook-salad', 'soup-stew'] },
  { id: 'italian-northern', displayName: 'Italian (Northern)', region: 'europe', signatureProteins: ['chicken breast', 'beef chuck (stew/braise)', 'fresh ricotta or cottage cheese', 'eggs', 'duck breast'], signatureVeggies: ['cremini or button mushrooms', 'butternut squash', 'swiss chard', 'lacinato or curly kale', 'leeks'], signatureStarches: ['short pasta', 'polenta', 'farro or pearled barley'], signatureFlavors: ['creamy-rich', 'herby', 'umami-heavy', 'nutty'], commonStyles: ['pasta-dish', 'braised', 'sheet-pan', 'soup-stew'] },
  { id: 'italian-southern', displayName: 'Italian (Southern)', region: 'europe', signatureProteins: ['ground beef (85/15)', 'ground pork', 'shrimp (peeled)', 'cod or pollock', 'canned sardines', 'eggs'], signatureVeggies: ['eggplant', 'zucchini', 'roma or cherry tomatoes', 'bell peppers', 'green beans'], signatureStarches: ['long pasta', 'short pasta', 'crusty baguette or sourdough'], signatureFlavors: ['bright-citrusy', 'garlicky', 'herby'], commonStyles: ['pasta-dish', 'grilled', 'no-cook-salad'] },
  { id: 'german-polish', displayName: 'German / Polish', region: 'europe', signatureProteins: ['pork tenderloin', 'bone-in pork chops', 'beef chuck (stew/braise)', 'bacon'], signatureVeggies: ['green or napa cabbage', 'beets', 'parsnips', 'sweet onions'], signatureStarches: ['russet potatoes', 'crusty baguette or sourdough'], signatureFlavors: ['vinegary', 'peppery-mild', 'smoky'], commonStyles: ['braised', 'sheet-pan', 'soup-stew'] },
  // Med / ME (4 — HARD CAP)
  { id: 'greek', displayName: 'Greek', region: 'med-me', signatureProteins: ['lamb shoulder', 'ground lamb', 'chicken thighs (boneless)', 'chickpeas (canned)', 'paneer or halloumi', 'tilapia or branzino'], signatureVeggies: ['english or persian cucumber', 'roma or cherry tomatoes', 'zucchini', 'swiss chard'], signatureStarches: ['pita or naan', 'long-grain white rice', 'crusty baguette or sourdough'], signatureFlavors: ['bright-citrusy', 'herby', 'garlicky'], commonStyles: ['grilled', 'no-cook-salad', 'sheet-pan'] },
  { id: 'spanish-tapas', displayName: 'Spanish (Tapas)', region: 'med-me', signatureProteins: ['shrimp (peeled)', 'canned sardines', 'eggs', 'chickpeas (canned)', 'cod or pollock', 'mussels or clams'], signatureVeggies: ['bell peppers', 'roma or cherry tomatoes'], signatureStarches: ['crusty baguette or sourdough', 'long-grain white rice'], signatureFlavors: ['smoky', 'garlicky', 'bright-citrusy'], commonStyles: ['tapas', 'grilled', 'no-cook-salad'] },
  { id: 'persian', displayName: 'Persian', region: 'med-me', signatureProteins: ['lamb shoulder', 'chicken thighs (boneless)', 'lentils (red or green)'], signatureVeggies: ['baby spinach', 'carrots', 'english or persian cucumber'], signatureStarches: ['basmati rice', 'pita or naan'], signatureFlavors: ['herby', 'bright-citrusy', 'sweet-savory'], commonStyles: ['braised', 'grilled', 'rice-bowl'] },
  { id: 'israeli', displayName: 'Israeli', region: 'med-me', signatureProteins: ['chicken thighs (boneless)', 'chickpeas (canned)', 'eggs', 'ground lamb', 'ground beef (85/15)'], signatureVeggies: ['eggplant', 'roma or cherry tomatoes', 'english or persian cucumber', 'bell peppers'], signatureStarches: ['pita or naan', 'long-grain white rice'], signatureFlavors: ['bright-citrusy', 'smoky', 'herby'], commonStyles: ['grilled', 'tapas', 'sheet-pan'] },
]

// ─── Cooking styles (15) ───────────────────────────────────────────────────

export const STYLES: Style[] = [
  { id: 'stir-fry', displayName: 'Stir-fry', characteristics: 'high-heat wok, ≤20 min, single-pan', weekendBias: false },
  { id: 'grilled', displayName: 'Grilled / charred', characteristics: 'direct heat, marinade or rub, char marks', weekendBias: true },
  { id: 'braised', displayName: 'Braised / stew', characteristics: 'low-and-slow in liquid, batch-friendly', weekendBias: true },
  { id: 'sheet-pan', displayName: 'Sheet-pan', characteristics: 'one tray, 400-425°F, 25-45 min', weekendBias: false },
  { id: 'slow-cooker', displayName: 'Slow cooker / Instant Pot', characteristics: 'set-and-forget, low active time', weekendBias: false },
  { id: 'pasta-dish', displayName: 'Pasta dish', characteristics: 'cook pasta + build sauce in same window', weekendBias: false },
  { id: 'rice-bowl', displayName: 'Rice or grain bowl', characteristics: 'base + protein + veg + sauce + crunch', weekendBias: false },
  { id: 'taco-wrap', displayName: 'Taco / wrap / handheld', characteristics: 'filled tortilla / pita / lettuce', weekendBias: false },
  { id: 'no-cook-salad', displayName: 'Big salad / no-cook', characteristics: 'no stove, raw veg + protein', weekendBias: false },
  { id: 'soup-stew', displayName: 'Soup / chowder', characteristics: 'pot, broth-based, leftovers improve', weekendBias: false },
  { id: 'curry', displayName: 'Curry', characteristics: 'aromatic base + simmered protein/veg', weekendBias: false },
  { id: 'sandwich', displayName: 'Sandwich / hero', characteristics: 'bread + filling + condiment', weekendBias: false },
  { id: 'pizza', displayName: 'Pizza / flatbread', characteristics: 'dough or flatbread, oven-finished', weekendBias: true },
  { id: 'dumplings', displayName: 'Dumplings / handheld bites', characteristics: 'filled dough, steamed/pan-fried', weekendBias: true },
  { id: 'tapas', displayName: 'Tapas / small plates', characteristics: 'multiple 2-4 bite portions, shared', weekendBias: true },
]

// ─── Flavor profiles (12) ──────────────────────────────────────────────────

export const FLAVORS: Flavor[] = [
  { id: 'bright-citrusy', displayName: 'Bright / citrusy', characteristics: 'lemon, lime, vinegar, fresh herbs' },
  { id: 'smoky', displayName: 'Smoky', characteristics: 'paprika, chipotle, charred edges' },
  { id: 'umami-heavy', displayName: 'Umami-heavy', characteristics: 'soy, fish sauce, miso, parmesan' },
  { id: 'herby', displayName: 'Fresh-herby', characteristics: 'basil, cilantro, parsley, dill, mint' },
  { id: 'spicy-hot', displayName: 'Spicy-hot', characteristics: 'fresh chili, dried chili, chili paste' },
  { id: 'creamy-rich', displayName: 'Creamy / rich', characteristics: 'butter, cream, coconut milk, cheese sauce' },
  { id: 'sweet-savory', displayName: 'Sweet-savory', characteristics: 'honey, mirin, brown sugar, hoisin, glazes' },
  { id: 'fermented', displayName: 'Fermented / funky', characteristics: 'kimchi, gochujang, miso, doubanjiang' },
  { id: 'vinegary', displayName: 'Vinegary / pickled', characteristics: 'rice vinegar, apple-cider, pickles, capers' },
  { id: 'nutty', displayName: 'Nutty', characteristics: 'sesame, peanut, almond, browned butter' },
  { id: 'peppery-mild', displayName: 'Peppery-mild', characteristics: 'black pepper, sage, thyme, kid-safe baseline' },
  { id: 'garlicky', displayName: 'Garlicky / allium-forward', characteristics: 'roasted garlic, scallion oil, leek confit' },
]

// ─── Helpers ───────────────────────────────────────────────────────────────

export function findCuisine(id: string): Cuisine | undefined {
  return CUISINES.find((c) => c.id === id)
}
export function findStyle(id: string): Style | undefined {
  return STYLES.find((s) => s.id === id)
}
export function findFlavor(id: string): Flavor | undefined {
  return FLAVORS.find((f) => f.id === id)
}
export function findProtein(name: string): Protein | undefined {
  return PROTEINS.find((p) => p.name === name)
}
