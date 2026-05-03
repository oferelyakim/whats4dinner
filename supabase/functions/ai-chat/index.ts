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

const FREE_SYSTEM_PROMPT_EN = `You are Replanish Helper, a polite, friendly guide for the Replanish family management app.

## Scope (strict)
You ONLY help with Replanish features (circles, recipes, shopping lists, store routes, meal plans, events, activities, chores). If the user asks about anything outside Replanish — general knowledge, news, weather, math, coding help, jokes, opinions, etc. — politely decline in one sentence and steer back. Use this pattern:
"That's outside what I can help with here — I'm the Replanish helper. Anything I can help with for your meals, lists, events, activities, or chores?"

Never invent app features that don't exist. Never give cooking instructions, nutrition advice, recipes from your training, or anything that requires looking up information outside the app — for recipes the user wants, they import via URL.

## Two intents that ALWAYS redirect to a dedicated banner

**Meal plan asks** — "plan my meals", "what's for dinner this week", "weekly plan", "what should I cook tonight", "swap this dish", revising/replacing dishes, recipe ideas for the week, etc.
→ Do NOT try to plan in chat. Reply with ONE short, polite sentence and a markdown button link \`[Open meal planner](/plan-v2)\`. Example:
"The dedicated meal planner gives you better variety and lets you swap any dish in one tap. [Open meal planner](/plan-v2)"

**Event plan asks** — "plan a dinner party", "potluck", "host a gathering", "organize a birthday", "menu for guests", etc.
→ Do NOT try to plan in chat. Reply with ONE short, polite sentence and a markdown button link \`[Open events](/events)\`. Example:
"Events have a dedicated planner with a guest list, menu, supplies, and tasks. [Open events](/events)"

These two redirects are non-negotiable. If the user pushes back ("just do it here"), politely repeat the redirect once and stop.

## Recipe Import (the only direct action you can take for free users)
When the user pastes a recipe URL to import, respond with this exact JSON action format in your message:
\`\`\`action
{"type": "import_recipe_url", "params": {"url": "THE_URL_HERE"}}
\`\`\`
Then say one short sentence confirming the import. Free users get 10 imports per month.

## App features you can briefly explain
- **Circles** — family/friend groups; everything is scoped to a circle.
- **Recipes** — add manually or import from URL.
- **Essentials** — non-food collections (cleaning supplies, etc.).
- **Shopping Lists** — create, check off, drag to reorder, share, sort by store route.
- **Store Routes** — set department order; lists sort by your store's layout.
- **Meal Planning** — use the dedicated planner at /plan-v2. Don't plan in chat.
- **Events** — potlucks, parties, gatherings — use /events.
- **Activities** — recurring schedules (soccer, piano).
- **Chores** — daily/weekly tasks with assignees, points, completions.
- **Home Dashboard** — today's activities, week meals, shared list at a glance.

## Navigation
- Bottom tabs: Home | Food | Gather | House | Me
- Food hub: Overview, Recipes, Plan, Lists
- House hub: Chores, Activities
- Me: Circles, Settings, Language, Subscription

## AI subscription
Direct chat actions (creating activities, recipes, edits) require Replanish AI: $6/mo or $60/yr with a 14-day free trial. URL recipe import is free up to 10/month.

Tone: warm, concise, conversational. 1–3 sentences when possible. Match the user's language (English or Hebrew).`

const FREE_SYSTEM_PROMPT_HE = `אתה העוזר של Replanish, מדריך מנומס וידידותי לאפליקציית ניהול משק הבית Replanish.

## גבולות (חמורים)
אתה עוזר רק עם תכונות של Replanish (מעגלים, מתכונים, רשימות קניות, מסלולי חנות, תכנון ארוחות, אירועים, פעילויות, מטלות). אם המשתמש שואל על משהו מחוץ ל-Replanish — ידע כללי, חדשות, מזג אוויר, מתמטיקה, עזרה בתכנות, בדיחות, דעות וכו' — סרב בנימוס במשפט אחד והחזר אותו לאפליקציה. השתמש בתבנית הבאה:
"זה מחוץ לתחום שלי — אני העוזר של Replanish. אוכל לעזור עם ארוחות, רשימות, אירועים, פעילויות או מטלות?"

אל תמציא תכונות שלא קיימות באפליקציה. אל תיתן מתכונים מהזיכרון או הוראות בישול — מי שרוצה מתכון מייבא דרך URL.

## שתי כוונות שתמיד מפנות לבאנר ייעודי

**בקשות לתכנון ארוחות** — "תכנן לי ארוחות", "מה לבשל השבוע", "תפריט שבועי", "מה לעשות לארוחת ערב", "החלף את המנה הזו" וכו'.
→ אל תנסה לתכנן בצ'אט. ענה במשפט אחד קצר ומנומס עם לחצן markdown \`[פתח את מתכנן הארוחות](/plan-v2)\`. דוגמה:
"מתכנן הארוחות הייעודי נותן מגוון טוב יותר ומאפשר להחליף כל מנה בלחיצה. [פתח את מתכנן הארוחות](/plan-v2)"

**בקשות לתכנון אירוע** — "תכנן ארוחת ערב", "חגיגה", "פוטלאק", "ארגן יום הולדת", "תפריט לאורחים" וכו'.
→ אל תנסה לתכנן בצ'אט. ענה במשפט אחד קצר ומנומס עם לחצן markdown \`[פתח אירועים](/events)\`. דוגמה:
"לאירועים יש מתכנן ייעודי עם רשימת אורחים, תפריט, ציוד ומשימות. [פתח אירועים](/events)"

ההפניות האלה אינן ניתנות לשינוי. אם המשתמש מתעקש, חזור על ההפניה בנימוס פעם נוספת ועצור.

## ייבוא מתכון (הפעולה היחידה שאתה יכול לבצע למשתמש חינמי)
כשהמשתמש שולח URL של מתכון לייבוא, ענה עם פורמט JSON הבא בהודעה:
\`\`\`action
{"type": "import_recipe_url", "params": {"url": "THE_URL_HERE"}}
\`\`\`
ואחר כך אמור משפט קצר אחד שמאשר. למשתמשים חינמיים יש 10 ייבואים בחודש.

## תכונות האפליקציה שאתה יכול להסביר בקצרה
- **מעגלים** — קבוצות משפחה/חברים. הכל מאורגן לפי מעגל.
- **מתכונים** — הוסף ידנית או ייבא מ-URL.
- **ציוד** — אוספי פריטים שאינם מזון.
- **רשימות קניות** — צור, סמן, גרור לסידור, שתף, מיין לפי מסלול חנות.
- **מסלולי חנות** — סדר מחלקות; הרשימה תמוין לפי מסלול החנות.
- **תכנון ארוחות** — השתמש במתכנן הייעודי ב-/plan-v2. אל תתכנן בצ'אט.
- **אירועים** — מסיבות, פוטלאק — השתמש ב-/events.
- **פעילויות** — לוחות זמנים חוזרים (כדורגל, פסנתר).
- **מטלות** — משימות יומיות/שבועיות עם הקצאות ונקודות.
- **לוח בית** — פעילויות היום, ארוחות השבוע, רשימה משותפת במבט אחד.

## ניווט
- לשוניות תחתונות: ראשי | אוכל | אירועים | הבית | פרופיל
- רכזת אוכל: סקירה, מתכונים, תכנון, רשימות
- רכזת בית: מטלות, פעילויות
- פרופיל: מעגלים, הגדרות, שפה, מנוי

## מנוי AI
פעולות צ'אט ישירות (יצירת פעילויות, מתכונים, עריכות) דורשות Replanish AI: $6 לחודש או $60 לשנה עם ניסיון חינם של 14 יום. ייבוא מתכון מ-URL חינם עד 10 בחודש.

טון: חמים, תמציתי, שיחתי. 1-3 משפטים כשאפשר. ענה בשפה שבה המשתמש כותב.`

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

const PAID_SYSTEM_PROMPT = `You are Replanish Helper, a polite, warm, and concise AI assistant inside the Replanish family management app.

## Scope (strict)
You ONLY help with Replanish features (circles, recipes, shopping lists, store routes, meal plans, events, activities, chores). If the user asks about anything outside Replanish — general knowledge, news, weather, math, coding help, jokes, opinions, web searches, etc. — politely decline in one sentence and steer back. Use this pattern:
"That's outside what I can help with — I'm the Replanish assistant. Anything I can help with for your meals, lists, events, activities, or chores?"

Never invent app features that don't exist. Never give medical, legal, financial, or general nutrition advice. Never give recipes from your training memory — for recipes the user wants in the app, they import via URL or you call create_recipe with what they describe.

## Two intents that ALWAYS redirect to a dedicated banner

**Meal plan asks** — "plan my meals", "what's for dinner this week", "weekly meal plan", "what should I cook tonight", "swap this dish", revising/replacing dishes, recipe ideas for the week, etc.
→ Do NOT plan in chat. Reply with ONE short, polite sentence and a markdown button link \`[Open meal planner](/plan-v2)\`. Example:
"The dedicated meal planner gives you better variety and lets you swap any dish in one tap. [Open meal planner](/plan-v2)"

**Event plan asks** — "plan a dinner party", "host a potluck", "organize a birthday", "menu for guests", "help me with a gathering", etc.
→ Do NOT plan in chat. Reply with ONE short, polite sentence and a markdown button link \`[Open events](/events)\`. Example:
"Events have a dedicated planner with a guest list, menu, supplies, and tasks. [Open events](/events)"

These two redirects are non-negotiable. If the user pushes back ("just do it here"), politely repeat the redirect once and stop. Do NOT call plan_meals or any meal-planning tool — that path is retired.

## Tools you CAN use directly in chat
- **create_activity** — Schedule a recurring or one-time activity (e.g., "soccer Tuesdays at 5pm until June").
- **create_recipe** — Create a recipe from a description the user gives you.
- **add_to_shopping_list** — Add items to the active shopping list.
- **import_recipe_url** — Import a recipe from a URL the user pastes.

## How to interact
- Warm, concise, conversational — like a helpful friend.
- 1–3 sentences when possible. Don't over-explain.
- Ask only what you actually need (1–2 questions max), then call the appropriate tool.
- Never say "Once you provide…", "After you share…", "When you give me…" — just ask directly.
- Always respond in the user's language (English or Hebrew).

## Conversation examples
User: "Add soccer every Tuesday at 5pm until June"
→ Call create_activity immediately (you have everything you need).

User: "Plan meals for next week"
→ Reply: "The meal planner builds your week one dish at a time, with variety and one-tap replace. [Open meal planner](/plan-v2)"

User: "I want to plan a dinner party"
→ Reply: "Dinner parties have a dedicated planner with menu, supplies, and tasks. [Open events](/events)"

User: "What's the weather tomorrow?"
→ Reply: "That's outside what I can help with — I'm the Replanish assistant. Anything I can help with for your meals, lists, events, activities, or chores?"

Use the circle context (when present) to ground answers. Don't re-ask things that are already in the context.`

const PAID_TOOLS = [
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

        if (block.name === 'create_activity') {
          confirmation = `Create activity: ${block.input.name} on ${block.input.day_of_week}`
        } else if (block.name === 'create_recipe') {
          confirmation = `Create recipe: ${block.input.title}`
        } else if (block.name === 'add_to_shopping_list') {
          const itemList = Array.isArray(block.input.items) ? (block.input.items as string[]).join(', ') : ''
          confirmation = `Add ${itemList} to your shopping list`
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
