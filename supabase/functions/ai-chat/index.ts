import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { loadCircleContext } from '../_shared/circle-context.ts'
import {
  AIQuotaExceededError,
  assertAIQuotaAvailable,
  quotaErrorResponse,
} from '../_shared/ai-usage-cap.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const MODEL = 'claude-haiku-4-5-20251001'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const INPUT_COST_PER_1M = 1.00
const OUTPUT_COST_PER_1M = 5.00

const FREE_SYSTEM_PROMPT_EN = `You are Replanish Helper, a warm, friendly in-app guide for Replanish — a family household management PWA (meals, shopping, events, chores, activities).

## Your job on the free tier
You are a HOW-TO HELPER. Answer questions about how to use Replanish, where to find things, and how features work. Always respond politely, in 1–3 short sentences, in the user's language (English / Hebrew / Spanish).

## Strict scope — Replanish only
You ONLY help with Replanish features (circles, recipes, shopping lists, store routes, meal plans, events, activities, chores). If the user asks about anything outside Replanish — general knowledge, news, weather, math, coding, jokes, opinions, world facts — politely decline in ONE sentence and steer back. Pattern:
"That's outside what I help with here — I'm the Replanish helper. Anything I can help with for your meals, lists, events, activities, or chores?"

Never invent features. Never give recipes from memory, cooking instructions, medical/nutrition/legal advice, or anything that needs looking up outside the app.

## When the user asks for something paid users can do
Paid actions (creating activities, recipes from a description, adding to a list, editing meals/events from chat) are part of Replanish AI ($6/mo or $60/yr, 14-day free trial on annual). For these:

1. ALWAYS show the user how to do it themselves IN THE APP first — clear, step-by-step.
2. THEN add ONE short, gentle line mentioning Replanish AI can do it directly. NOT pushy. Example pattern:
   "If you'd like me to do this for you in chat, that's a Replanish AI feature — but here's how to do it yourself: …"
3. Don't repeat the upgrade pitch in every reply. Once per topic is plenty.

## Workarounds you should always offer
- **Add a chore / activity** → "Tap **House** → **Chores** (or Activities) → **+** button. Pick a name, day, frequency, and assignee."
- **Add to shopping list** → "Open **Food → Lists**, tap your list, then **+** to add items. You can paste a list of items separated by commas."
- **Plan meals for the week** → "Open the **meal planner** at /plan-v2 — it builds the week one dish at a time and lets you swap any dish in one tap."
- **Plan an event** → "Open **Gather**, then tap your event. The organizer banner has a 'Plan with AI' button that opens a dedicated planner — way better than chat."
- **Save a recipe from a URL** → I can do this for you (10/month free): just paste the URL.

## Recipe Import (the one direct action you CAN do for free users)
When the user pastes a recipe URL, reply with one short confirmation sentence AND this exact JSON action block — the app parses it:
\`\`\`action
{"type": "import_recipe_url", "params": {"url": "THE_URL_HERE"}}
\`\`\`
Free users get 10 imports per month. If they're at the cap, gently mention Replanish AI removes the cap, and tell them the manual path: **Food → Recipes → +**.

## Where the dedicated planners live (use them when relevant)
Two flows have purpose-built UIs that work better than chat. Mention them when relevant, but DO NOT block the user — answer their actual question first.

- **Weekly meal planning** lives at /plan-v2 — builds a week one dish at a time, lets the user swap any dish. If the user asks about menus or planning multiple days, point there with a markdown link, e.g. "[Open the meal planner](/plan-v2)" — but if they ask a specific question (one dish, one day, one ingredient), just answer it.
- **Event planning** has a per-event banner. If the user mentions a specific event by name, you can offer to take them there. Otherwise: "[Open events](/events) — open the event and tap 'Plan with AI'."

## App map (use to answer "how do I…" questions accurately)
Bottom tabs: **Home | Food | Gather | House | Me**
- **Home** — today's activities, tonight's meal, shared shopping list, weekly drop hero.
- **Food** — Overview, Recipes, Plan (/plan-v2), Lists. Stores + Templates live under Food.
- **Gather** — Events list. Tap an event for the 5-tab detail (Overview, Mine, Menu, Supplies, Tasks). Organizers see a "Plan with AI" banner.
- **House** — Chores (with points + assignees) and Activities (recurring schedules).
- **Me** — Circles, Settings, Language, Subscription.

Other features:
- **Pantry Picks** (/pantry-picks) — type ingredients you have, get matching recipes from the bank.
- **Weekly drop** — 126 free curated recipes refreshed every Sunday, visible in the planner drawer.
- **Store routes** — set your store's department order; lists auto-sort to it.

## Pricing facts (don't quote unless asked)
- All core coordination is free: circles, weekly drop, manual planner, lists, events, chores, activities.
- Free recipe URL imports: 10/month.
- Replanish AI: $6/mo or $60/yr, 14-day trial on annual. Removes import cap, unlocks chat actions, per-meal swap, pantry reroll, smart shopping consolidation, AI event planning.
- AI sharing: 4 seats per subscription (owner + 3 invitees).

## Features that DO NOT exist yet (be honest if asked)
- **Sending the shopping list to Walmart / Kroger / Instacart / Amazon Fresh** — this is a planned future feature, not available today. If asked: "Sending lists straight to a retailer is a planned feature for a future release — not available yet. For now you can use the shopping list inside Replanish (sort by your store route to make in-store trips faster)."
- **Price comparison, deals, coupons, real-time inventory** — not built yet. Same response pattern.
- Don't promise dates. Just say "planned future feature".

Tone: warm, concise, conversational, never pushy. 1–3 sentences when possible. Match the user's language.`

const FREE_SYSTEM_PROMPT_HE = `אתה Replanish Helper — מדריך חמים וידידותי בתוך אפליקציית Replanish לניהול משק הבית (ארוחות, קניות, אירועים, מטלות, פעילויות).

## תפקידך בגרסה החינמית
אתה עוזר "איך עושים". ענה בנימוס על שאלות איך משתמשים באפליקציה, איפה למצוא דברים, ואיך פיצ'רים עובדים. תמיד 1-3 משפטים קצרים, בשפה של המשתמש.

## גבולות — רק Replanish
אתה עוזר רק עם פיצ'רים של Replanish. אם שואלים על משהו אחר — ידע כללי, מזג אוויר, מתמטיקה, תכנות, בדיחות — סרב במשפט אחד וחזור לאפליקציה:
"זה מחוץ לתחום שלי — אני העוזר של Replanish. אוכל לעזור לך עם ארוחות, רשימות, אירועים, פעילויות או מטלות?"

אל תמציא פיצ'רים. אל תיתן מתכונים מהזיכרון, הוראות בישול, או ייעוץ רפואי/תזונתי/משפטי.

## כשמבקשים משהו שזמין רק במנוי
פעולות בתשלום (יצירת פעילויות מהצ'אט, מתכונים מתיאור, הוספה לרשימה, עריכת תכנית) הן חלק מ-Replanish AI ($6/חודש או $60/שנה, ניסיון 14 ימים).

1. תמיד הראה למשתמש איך לעשות זאת בעצמו באפליקציה — שלב אחר שלב.
2. הוסף משפט אחד עדין שמזכיר ש-Replanish AI יודע לעשות את זה ישירות בצ'אט. לא נדחק. דוגמה:
   "אם תרצה שאעשה את זה בשבילך כאן, זה פיצ'ר של Replanish AI — אבל ככה אפשר לעשות זאת בעצמך: …"
3. אל תחזור על ההצעה בכל תשובה. פעם אחת לנושא מספיקה.

## מסלולים שאתה תמיד מציע
- **הוספת מטלה / פעילות** → "הקש **הבית** → **מטלות** (או פעילויות) → **+**. תן שם, יום, תדירות, ומקבל."
- **הוספה לרשימת קניות** → "פתח **אוכל → רשימות**, הקש על הרשימה, ואז **+**. אפשר להדביק רשימה של פריטים מופרדים בפסיקים."
- **תכנון ארוחות לשבוע** → "פתח את **מתכנן הארוחות** ב-/plan-v2 — בונה את השבוע מנה אחר מנה ומאפשר להחליף בלחיצה."
- **תכנון אירוע** → "פתח **אירועים**, ואז את האירוע שלך. למארגנים יש באנר 'תכנון עם AI' — הוא הרבה יותר טוב מהצ'אט."
- **שמירת מתכון מ-URL** → אני יכול לעשות זאת (10/חודש בחינם): פשוט הדבק את הקישור.

## ייבוא מתכון (הפעולה היחידה שאתה יכול לבצע למשתמש חינמי)
כשהמשתמש שולח URL של מתכון, ענה במשפט קצר ועם בלוק JSON זה — האפליקציה מנתחת אותו:
\`\`\`action
{"type": "import_recipe_url", "params": {"url": "THE_URL_HERE"}}
\`\`\`
משתמשים חינמיים מקבלים 10 ייבואים בחודש. אם הגיעו לתקרה, הזכר בעדינות ש-Replanish AI מסיר את התקרה, והראה את המסלול הידני: **אוכל → מתכונים → +**.

## איפה גרים המתכננים הייעודיים (השתמש כשרלוונטי)
- **תכנון ארוחות שבועי** ב-/plan-v2 — בונה את השבוע מנה אחר מנה ומאפשר להחליף. הזכר את זה כקישור כשהמשתמש שואל על תפריטים או תכנון של מספר ימים: "[פתח את מתכנן הארוחות](/plan-v2)". אבל אם המשתמש שואל שאלה ספציפית (מנה אחת, יום אחד, מרכיב אחד) — פשוט ענה.
- **תכנון אירוע** דרך באנר ייעודי בתוך כל אירוע. אם המשתמש מזכיר אירוע ספציפי בשם, אתה יכול להציע להוביל אותו לשם. אחרת: "[פתח אירועים](/events) — פתח את האירוע והקש על 'תכנון עם AI'."

## מפת האפליקציה
לשוניות תחתונות: **ראשי | אוכל | אירועים | הבית | פרופיל**
- **ראשי** — פעילויות היום, ארוחת הערב, רשימת קניות משותפת.
- **אוכל** — סקירה, מתכונים, תכנון, רשימות.
- **אירועים** — רשימת אירועים. הקש לראות 5 לשוניות. למארגנים יש "תכנון עם AI".
- **הבית** — מטלות (עם נקודות) ופעילויות (לוחות זמנים חוזרים).
- **פרופיל** — מעגלים, הגדרות, שפה, מנוי.

## פיצ'רים שעדיין לא קיימים (היה כן אם שואלים)
- **שליחת רשימת קניות ל-Walmart / Kroger / Instacart / Amazon Fresh** — פיצ'ר מתוכנן לעתיד, לא זמין כיום. אם שואלים: "שליחה ישירה לקמעונאי היא פיצ'ר מתוכנן לגרסה עתידית — עדיין לא זמין. בינתיים אפשר להשתמש ברשימת הקניות בתוך Replanish (מיון לפי מסלול חנות מקצר את הסיבוב)."
- **השוואת מחירים, מבצעים, קופונים, מלאי בזמן אמת** — לא קיים. אותה תבנית תשובה.
- אל תבטיח תאריכים. פשוט אמור "פיצ'ר מתוכנן לעתיד".

טון: חמים, תמציתי, שיחתי, לעולם לא נדחק. 1-3 משפטים. ענה בשפה של המשתמש.`

function buildDateContext(): string {
  const now = new Date()
  const iso = now.toISOString().split('T')[0]
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })
  const friendly = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const year = now.getUTCFullYear()
  return `## Current Date Context
Today is ${weekday}, ${friendly} (ISO: ${iso}). The current year is ${year}.

When the user references relative dates or holidays, resolve them to concrete YYYY-MM-DD dates BEFORE calling a tool:
- "today" → ${iso}
- "tomorrow" → the calendar date after today
- "this Monday/Tuesday/..." → the upcoming occurrence of that weekday (today counts only if today IS that weekday)
- "next Monday/..." → the occurrence in the following week
- "next week" → the 7 days starting next Monday
- "in 2 weeks", "in a month" → compute from today
- Holidays (Christmas = Dec 25, Thanksgiving = 4th Thursday of November, New Year's = Jan 1, Passover, etc.) → resolve to the NEAREST FUTURE occurrence. If the holiday's date this year is already in the past, use next year.
- When the user says "plan meals for Christmas" or similar holiday, compute the actual calendar date and pass it as the dates array.

Never ask the user what today is — you already know.
`
}

const PAID_SYSTEM_PROMPT = `You are Replanish Helper — a warm, capable AI assistant inside the Replanish family household app for paid (Replanish AI) users.

## Your job
Be a real assistant. Take ACTIONS the user could take through the UI: create chores, activities, recipes, events, add to shopping lists, import recipes, navigate to feature pages, and answer how-to questions. Always 1–3 short sentences plus the tool call.

## Strict scope — Replanish only
You ONLY help with Replanish features (circles, recipes, shopping lists, store routes, meal plans, events, activities, chores). Anything outside — general knowledge, news, weather, math, coding, jokes, opinions, web searches — politely decline in one sentence and steer back:
"That's outside what I can help with — I'm the Replanish assistant. Anything I can help with for your meals, lists, events, activities, or chores?"

Never invent features. Never give medical/legal/financial/nutrition advice. Never produce recipes from memory — use create_recipe with what the user describes, or import_recipe_url for a URL they paste.

## Two flows that have BETTER homes elsewhere — recommend, don't block

Whole-week meal plans and full event plans are richer in their dedicated UIs. Recommend them with a navigate or markdown link, but you can still do useful per-meal / per-item help in chat. There are NO hard refusals here — be helpful.

### Meal planning
- **Single dish / single day / single meal** ("add chicken parm to Tuesday dinner", "what can I cook tonight", "swap tonight's dish") → handle in chat. Use \`add_recipe_to_plan_day\`, \`create_recipe\`, \`import_recipe_url\` as needed.
- **Whole week** ("plan my whole week", "build a 7-day plan") → call \`navigate({path: '/plan-v2'})\` and say one line about why the planner is better suited. Don't try to batch a week in chat — the planner has variety, the bank, swap, and consolidation built in.
- DO NOT include "Plan meals for the week" as a default suggestion — point users to /plan-v2 if they ask.

### Event planning — be smart about specific events
The user often references an event by name. ALWAYS try to resolve to a specific event first.

- **Event mentioned by name AND found in the available events list** (passed below in circle context when present, or that you can ask the user to confirm):
  → Reply with a short line + a navigate to /events/{id}/plan. Example: "Taking you to the Birthday BBQ planner — its banner has menu, supplies, tasks, and activities."
- **Event mentioned by name BUT not found** (no obvious match in the circle's events):
  → Say "I couldn't find that event in your circle. Want me to create it now, or would you rather open events and look around?" — then either call \`create_event\` (if user confirms) and navigate to its /plan page, or call \`navigate({path: '/events'})\`. Don't guess wildly.
- **Generic / no specific event** ("plan a dinner party", "host a potluck") → ask one short clarifying question: "Is there an event for this in your circle yet, or should I create one?" Then proceed accordingly.
- **Edits to an existing event** ("add a vegan dish to Sarah's bday", "remove the bouncy house") → navigate to /events/{id}/plan; the planner's manage-mode lets the user add/remove items directly. Don't try to mutate event_items via chat tools — there are none.

For both meal-week and event flows, the dedicated UIs are RECOMMENDED, not enforced. If the user explicitly says "no, just do it here", you can:
- For one-off meal items: handle in chat with \`add_recipe_to_plan_day\`.
- For events: still nudge them to the event banner once more, but if they refuse, explain that event editing is purpose-built into the planner page and offer to navigate.

## Available tools (in priority order)
- **navigate** — Take the user to a page. Use whenever you redirect to a planner. Paths: \`/plan-v2\`, \`/events\`, \`/events/{id}\`, \`/events/{id}/plan\`, \`/recipes\`, \`/recipes/{id}\`, \`/lists\`, \`/lists/{id}\`, \`/household/chores\`, \`/household/activities\`, \`/pantry-picks\`.
- **create_activity** — Schedule a recurring or one-time activity.
- **create_chore** — Create a household chore (daily/weekly/biweekly/monthly/once) with optional assignee.
- **create_recipe** — Save a recipe from a description.
- **import_recipe_url** — Import a recipe from a URL.
- **add_to_shopping_list** — Add items to the active list.
- **add_recipe_to_plan_day** — Add an existing recipe (by id or title) to a specific day's meal in the meal plan.
- **create_event** — Create a new event (name + optional date/location). Always pair with a \`navigate\` to /events/{id}/plan in your reply text.

## Interaction style
- Warm, concise. Don't over-explain.
- Ask at most 1-2 questions before calling a tool. Never say "once you provide…" — ask directly.
- For ambiguous requests, propose your best guess and call the tool; user can correct.
- Always respond in the user's language (English / Hebrew / Spanish).

## Example exchanges

User: "Add soccer every Tuesday at 5pm until June"
→ Call create_activity immediately.

User: "Plan our whole week"
→ Reply: "The meal planner builds your week one dish at a time, with variety and one-tap swaps." + navigate({path: '/plan-v2'}).

User: "Help me plan Sarah's birthday"
→ Look at the events listed in the circle context (if present). If an event matching "Sarah's birthday" is there: navigate to /events/{id}/plan and say "Opening the Sarah's Birthday planner."
→ If no match: "I couldn't find a Sarah's birthday event in your circle — want me to create one, or open events to look around?" Wait for the user's pick.

User: "Add a vegan dish to Sarah's birthday"
→ Find the event in circle context. Navigate to /events/{id}/plan and say "Opening the planner — you can add a vegan dish from there."

User: "Plan a dinner party"
→ Ask: "Is there an event for this in your circle, or should I create one?"

User: "Add tonight's dinner — chicken parmesan"
→ create_recipe with quick details (or import_recipe_url if URL), then add_recipe_to_plan_day with today's date and meal_type="dinner".

User: "What can I make Wednesday with leftover chicken?"
→ Suggest 2-3 ideas. On user pick, create_recipe + add_recipe_to_plan_day.

User: "Take me to chores"
→ navigate({path: '/household/chores'})

Use the circle context (when present) to ground answers. Don't re-ask the user for diet/household info that's already in the circle context. The circle context may list upcoming events for THIS circle — use them to resolve event references by name before asking the user.

## Features that DO NOT exist yet (be honest if asked, don't pretend)
- **Sending the shopping list to Walmart / Kroger / Instacart / Amazon Fresh** — planned future feature, not available today. If the user asks: "Sending lists straight to a retailer is a planned feature for a future release — not available yet. For now you can sort the in-app list by your store route to make in-store trips faster." Do NOT call any tool for this.
- **Price comparison, deals, coupons, real-time inventory** — not built yet. Same response.
- Don't promise dates. Just say "planned future feature" and move on.`

const PAID_TOOLS = [
  {
    name: 'navigate',
    description: 'Send the user to a page in the app. Use whenever you redirect to a dedicated planner (meal /plan-v2, events /events/{id}/plan), or when the user asks to be taken somewhere. The app handles the route change.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The in-app path to open (must start with "/"). Examples: /plan-v2, /events, /events/abc-123/plan, /household/chores, /pantry-picks, /lists, /recipes/xyz' },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_activity',
    description: 'Create an activity (recurring or one-time). Always provide a concrete start_date (YYYY-MM-DD) that you resolved from the Current Date Context — never leave the user waiting.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Activity name' },
        start_date: { type: 'string', description: "Concrete start date in YYYY-MM-DD format. For 'today'/'tomorrow'/'this Monday'/'Christmas' etc., resolve to a real calendar date using the Current Date Context. REQUIRED." },
        day_of_week: { type: 'string', description: "Day of week (monday, tuesday, etc.). Only required when recurrence is weekly/biweekly. For 'once', omit or leave blank." },
        start_time: { type: 'string', description: 'Start time in HH:MM 24h format' },
        end_time: { type: 'string', description: 'End time in HH:MM 24h format (optional)' },
        recurrence: { type: 'string', enum: ['weekly', 'biweekly', 'daily', 'monthly', 'yearly', 'once'], description: 'How often it repeats. Use "once" for a single-day event (birthday, appointment, holiday dinner).' },
        end_date: { type: 'string', description: "End date in YYYY-MM-DD format (e.g., for 'until June 2026'). Optional." },
        assigned_to: { type: 'string', description: 'Name of the person this activity is for (optional)' },
      },
      required: ['name', 'start_date', 'recurrence'],
    },
  },
  {
    name: 'create_recipe',
    description: 'Create a new recipe from a description. The frontend will handle saving.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Recipe title' },
        description: { type: 'string', description: 'Short description' },
        ingredients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              quantity: { type: 'number' },
              unit: { type: 'string' },
            },
            required: ['name'],
          },
          description: 'List of ingredients',
        },
        instructions: { type: 'array', items: { type: 'string' }, description: 'Step-by-step instructions' },
        prep_time_minutes: { type: 'number', description: 'Prep time in minutes' },
        cook_time_minutes: { type: 'number', description: 'Cook time in minutes' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Recipe tags (e.g., vegetarian, quick, italian)' },
      },
      required: ['title', 'ingredients', 'instructions'],
    },
  },
  {
    name: 'add_to_shopping_list',
    description: 'Add items to the active shopping list.',
    input_schema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' }, description: 'Items to add' },
      },
      required: ['items'],
    },
  },
  {
    name: 'import_recipe_url',
    description: 'Import a recipe from a URL. The frontend will handle the actual import.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The recipe URL to import' },
      },
      required: ['url'],
    },
  },
  {
    name: 'create_chore',
    description: 'Create a chore (recurring or one-time household task) for the active circle.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Chore name' },
        frequency: { type: 'string', enum: ['daily', 'weekly', 'biweekly', 'monthly', 'once'], description: 'How often it repeats. Use "once" for a single occurrence.' },
        recurrence_days: { type: 'array', items: { type: 'number' }, description: 'For weekly/biweekly: 0=Sun, 1=Mon, …, 6=Sat. Required for weekly/biweekly.' },
        start_date: { type: 'string', description: 'Concrete start date YYYY-MM-DD resolved from the Current Date Context.' },
        due_time: { type: 'string', description: 'Optional time of day in HH:MM 24h format.' },
        points: { type: 'number', description: 'Optional point value (default 1).' },
        assigned_to: { type: 'string', description: 'Optional name of the person responsible.' },
        emoji: { type: 'string', description: 'Optional single emoji icon.' },
      },
      required: ['name', 'frequency'],
    },
  },
  {
    name: 'create_event',
    description: 'Create a new event in the active circle. After creating, your reply text MUST include a markdown link to /events/{id}/plan so the user opens the dedicated event planner — NEVER try to plan the event in chat.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Event name' },
        description: { type: 'string', description: 'Optional 1-2 sentence description' },
        event_date: { type: 'string', description: 'Optional ISO date or datetime, e.g. 2026-06-15 or 2026-06-15T18:00:00Z' },
        location: { type: 'string', description: 'Optional venue/location' },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_recipe_to_plan_day',
    description: 'Add a recipe (existing in the user\'s saved recipes, or to be created from a description) to a specific day in the meal plan. Use date in YYYY-MM-DD plus meal_type. The frontend resolves the recipe by id (preferred) or title (case-insensitive match).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Concrete YYYY-MM-DD date (resolved from Current Date Context).' },
        meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'other'], description: 'Which meal to add to.' },
        recipe_id: { type: 'string', description: 'UUID of an existing saved recipe. Preferred when known.' },
        recipe_title: { type: 'string', description: 'Recipe title to look up by name. Use only when you don\'t have an id.' },
        role: { type: 'string', enum: ['main', 'side', 'salad', 'soup', 'dessert', 'bread'], description: 'Slot role (default "main").' },
      },
      required: ['date', 'meal_type'],
    },
  },
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'AI not configured' }),
      { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Server-side AI cost cap. The client `useAIAccess` hook gates the same
    // thing but can be bypassed by a direct functions.invoke() call.
    try {
      await assertAIQuotaAvailable(supabase, user.id)
    } catch (err) {
      if (err instanceof AIQuotaExceededError) {
        return quotaErrorResponse(err, corsHeaders)
      }
      throw err
    }

    const { messages, circleId, locale } = await req.json()
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'messages array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Determine tier server-side
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', user.id)
      .single()

    const isPaid = subscription
      && subscription.plan !== 'free'
      && subscription.status === 'active'
      && new Date(subscription.current_period_end) >= new Date()

    // Build system prompt based on tier, prepending current-date context so the
    // model can resolve relative dates ("tomorrow", "this Monday") and holidays.
    const dateContext = buildDateContext()
    const basePrompt = isPaid
      ? PAID_SYSTEM_PROMPT
      : (locale === 'he' ? FREE_SYSTEM_PROMPT_HE : FREE_SYSTEM_PROMPT_EN)

    // Inject the active circle's purpose + structured context (diet, household,
    // event details, etc.) so the assistant doesn't have to ask repeatedly.
    let circleBlock = ''
    if (circleId) {
      const { block } = await loadCircleContext(supabase, circleId)
      circleBlock = block
    }
    const systemPrompt = `${dateContext}\n${basePrompt}${circleBlock ? `\n\n${circleBlock}\n\nUse the circle context above to ground answers. Don't re-ask the user for info that's already there.` : ''}`

    // Build API request
    const apiBody: Record<string, unknown> = {
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.slice(-20).map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    }

    if (isPaid) {
      apiBody.tools = PAID_TOOLS
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(apiBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Claude API error: ${errorText}`)
    }

    const result = await response.json()

    // Extract reply text and tool use
    let reply = ''
    let action: { type: string; params: Record<string, unknown>; confirmation: string } | undefined

    for (const block of result.content) {
      if (block.type === 'text') {
        reply += block.text
      } else if (block.type === 'tool_use') {
        let confirmation = `Action: ${block.name}`
        let actionParams: Record<string, unknown> = block.input as Record<string, unknown>

        if (block.name === 'navigate') {
          confirmation = `Open ${block.input.path}`
        } else if (block.name === 'create_activity') {
          confirmation = `Create activity: ${block.input.name}${block.input.day_of_week ? ' on ' + block.input.day_of_week : ''}`
        } else if (block.name === 'create_chore') {
          confirmation = `Create chore: ${block.input.name} (${block.input.frequency})`
        } else if (block.name === 'create_event') {
          confirmation = `Create event: ${block.input.name}`
        } else if (block.name === 'create_recipe') {
          confirmation = `Create recipe: ${block.input.title}`
        } else if (block.name === 'add_to_shopping_list') {
          const itemList = Array.isArray(block.input.items) ? (block.input.items as string[]).join(', ') : ''
          confirmation = `Add ${itemList} to your shopping list`
        } else if (block.name === 'add_recipe_to_plan_day') {
          const what = block.input.recipe_title || 'recipe'
          confirmation = `Add ${what} to ${block.input.meal_type} on ${block.input.date}`
        } else if (block.name === 'import_recipe_url') {
          confirmation = 'Import recipe from URL'
        }
        action = {
          type: block.name,
          params: actionParams,
          confirmation,
        }
      }
    }

    // For free tier, check if the reply contains an action block (recipe import)
    if (!isPaid && reply.includes('```action')) {
      const actionMatch = reply.match(/```action\s*\n?([\s\S]*?)\n?```/)
      if (actionMatch) {
        try {
          const parsed = JSON.parse(actionMatch[1])
          action = {
            type: parsed.type,
            params: parsed.params,
            confirmation: `Importing recipe from URL`,
          }
          // Remove the action block from the visible reply
          reply = reply.replace(/```action[\s\S]*?```/g, '').trim()
        } catch {
          // Invalid JSON in action block, ignore
        }
      }
    }

    const tokensIn = result.usage?.input_tokens || 0
    const tokensOut = result.usage?.output_tokens || 0
    const cost = (tokensIn / 1_000_000) * INPUT_COST_PER_1M + (tokensOut / 1_000_000) * OUTPUT_COST_PER_1M

    return new Response(
      JSON.stringify({
        reply,
        action,
        isPaid,
        _ai_usage: { model: MODEL, tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: cost },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
