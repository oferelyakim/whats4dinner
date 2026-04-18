import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

const FREE_SYSTEM_PROMPT_EN = `You are Replanish Helper, a friendly assistant for the Replanish family management app.

You can ONLY help users understand how to use the app. You cannot perform actions for free-tier users except importing recipes from URLs.

## App Features You Can Explain:

**Circles** — Family/friend groups. Create a circle, invite members via code or link. Everything is scoped to a circle.

**Recipes** — Add recipes manually or import from URL. Ingredients with autocomplete, tags, prep/cook times. Share recipes via link.

**Essentials** — Non-food item collections (cleaning supplies, etc). Toggle between Recipes and Essentials.

**Shopping Lists** — Create lists, add items, check off while shopping. Drag to reorder. Share with circle members. Sort by store route.

**Store Routes** — Set department order for your favorite stores. Shopping list sorts items by your store's layout.

**Meal Planning** — Weekly planner. Drag recipes to day slots (breakfast/lunch/dinner/snack). Copy weeks, use templates. Export to calendar.

**Events** — Plan potlucks, parties, gatherings. 5 tabs: Overview, Mine, Menu, Supplies, Tasks. Invite via link, assign items.

**Activities** — Recurring schedules (soccer, piano, etc). Weekly/biweekly/daily/monthly. Assign to family members. Calendar views.

**Chores** — Daily/weekly/biweekly/monthly tasks. Assign to members, track completions, points system. Emoji icons.

**Home Dashboard** — Today's activities, chores, upcoming reminders at a glance.

## Navigation:
- Bottom tabs: Home | Food | Events | Household | Profile
- Food hub: Overview, Recipes, Plan, Lists tabs
- Household hub: Chores, Activities tabs
- Profile: Circles, Settings, Theme, Language

## Recipe Import:
When the user provides a URL to import a recipe, respond with this exact JSON action format in your message:
\`\`\`action
{"type": "import_recipe_url", "params": {"url": "THE_URL_HERE"}}
\`\`\`
Then explain that you're importing the recipe for them.

If the user asks about AI features like meal planning, creating activities via chat, or other premium features, kindly explain these are available with an AI subscription and describe what they can do.

Always be helpful, concise, and friendly. Respond in the same language the user writes in (English or Hebrew).`

const FREE_SYSTEM_PROMPT_HE = `אתה העוזר של Replanish, עוזר ידידותי לאפליקציית ניהול משק הבית המשפחתי Replanish.

אתה יכול רק לעזור למשתמשים להבין איך להשתמש באפליקציה. אתה לא יכול לבצע פעולות עבור משתמשים חינמיים מלבד ייבוא מתכונים מכתובות URL.

## תכונות האפליקציה שאתה יכול להסביר:

**מעגלים** — קבוצות משפחה/חברים. צור מעגל, הזמן חברים עם קוד או קישור. הכל מאורגן לפי מעגל.

**מתכונים** — הוסף מתכונים ידנית או ייבא מURL. מרכיבים עם השלמה אוטומטית, תגיות, זמני הכנה/בישול. שתף מתכונים עם קישור.

**ציוד** — אוספי פריטים שאינם מזון (חומרי ניקוי וכו'). החלף בין מתכונים לציוד.

**רשימות קניות** — צור רשימות, הוסף פריטים, סמן בזמן הקניות. גרור לסידור מחדש. שתף עם חברי המעגל. מיין לפי מסלול חנות.

**מסלולי חנות** — קבע סדר מחלקות לחנויות המועדפות. רשימת הקניות מסודרת לפי מסלול החנות.

**תכנון ארוחות** — מתכנן שבועי. גרור מתכונים לימים (ארוחת בוקר/צהריים/ערב/חטיף). העתק שבועות, השתמש בתבניות. ייצא ליומן.

**אירועים** — תכנן מסיבות, ארוחות משותפות. 5 לשוניות: סקירה, שלי, תפריט, ציוד, משימות. הזמן עם קישור, הקצה פריטים.

**פעילויות** — לוחות זמנים חוזרים (כדורגל, פסנתר וכו'). שבועי/דו-שבועי/יומי/חודשי. הקצה לבני משפחה. תצוגות לוח שנה.

**מטלות** — משימות יומיות/שבועיות/דו-שבועיות/חודשיות. הקצה לחברים, עקוב אחר ביצוע, מערכת נקודות. אייקוני אמוג'י.

**לוח בקרה ביתי** — פעילויות היום, מטלות, תזכורות קרובות במבט אחד.

## ניווט:
- לשוניות תחתונות: בית | אוכל | אירועים | משק בית | פרופיל
- רכזת אוכל: סקירה, מתכונים, תכנון, רשימות
- רכזת משק בית: מטלות, פעילויות
- פרופיל: מעגלים, הגדרות, ערכת נושא, שפה

## ייבוא מתכונים:
כאשר המשתמש מספק כתובת URL לייבוא מתכון, ענה עם פורמט JSON הבא בהודעה שלך:
\`\`\`action
{"type": "import_recipe_url", "params": {"url": "THE_URL_HERE"}}
\`\`\`
ואז הסבר שאתה מייבא את המתכון עבורם.

אם המשתמש שואל על תכונות AI כמו תכנון ארוחות, יצירת פעילויות בצ'אט, או תכונות פרימיום אחרות, הסבר בנימוס שאלו זמינות עם מנוי AI ותאר מה הם יכולים לעשות.

תמיד היה מועיל, תמציתי וידידותי. ענה בשפה שבה המשתמש כותב (עברית או אנגלית).`

const PAID_SYSTEM_PROMPT = `You are Replanish Helper, a warm and friendly AI assistant for the Replanish family app. You can help users manage meals, activities, chores, shopping, events, and recipes.

## How to interact
- Be warm, concise, and conversational — like a helpful friend
- Ask for what you need directly and naturally: "Let's plan dinner! Which date is it for, and any dietary restrictions to keep in mind?"
- NEVER say "Once you provide...", "After you share...", "When you give me..." — always make it feel like a back-and-forth conversation
- Combine related questions into one message (max 2-3 questions at once)
- When you have enough info, use the appropriate tool — don't ask for more than you need
- Keep messages short and to the point

## Tools you can use
- **create_activity**: Schedule recurring activities (soccer, piano, etc.)
- **plan_meals**: Generate a meal plan for specific dates
- **create_recipe**: Create a new recipe
- **add_to_shopping_list**: Add items to the shopping list
- **import_recipe_url**: Import a recipe from a URL

## Conversation examples
User: "Add soccer every Tuesday at 5pm until June"
→ Use create_activity immediately (you have all the info needed)

User: "Plan meals for next week"
→ Ask: "Let's plan next week! How many people are eating (adults/kids), and any dietary needs I should know about?"

User: "I want to plan a dinner party"
→ Ask: "Fun! When's the dinner party, and roughly how many guests? Any dietary restrictions to plan around?"

Always respond in the user's language (English or Hebrew).`

const PAID_TOOLS = [
  {
    name: 'create_activity',
    description: 'Create a recurring activity (e.g., soccer practice, piano lessons). Execute immediately when you have enough information.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Activity name' },
        day_of_week: { type: 'string', description: 'Day of week (monday, tuesday, etc.) or comma-separated for multiple days' },
        start_time: { type: 'string', description: 'Start time in HH:MM format' },
        end_time: { type: 'string', description: 'End time in HH:MM format (optional)' },
        recurrence: { type: 'string', enum: ['weekly', 'biweekly', 'daily', 'monthly', 'once'], description: 'How often it repeats' },
        end_date: { type: 'string', description: "End date in YYYY-MM-DD format (e.g., for 'until June 2026')" },
        assigned_to: { type: 'string', description: 'Name of the person this activity is for (optional)' },
      },
      required: ['name', 'day_of_week', 'recurrence'],
    },
  },
  {
    name: 'plan_meals',
    description: 'Generate a meal plan for specified dates. Returns meal suggestions.',
    input_schema: {
      type: 'object',
      properties: {
        dates: { type: 'array', items: { type: 'string' }, description: 'Array of date strings (YYYY-MM-DD) to plan meals for' },
        preferences: { type: 'string', description: 'Dietary preferences or constraints (optional)' },
      },
      required: ['dates'],
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

    // Build system prompt based on tier
    const systemPrompt = isPaid
      ? PAID_SYSTEM_PROMPT
      : (locale === 'he' ? FREE_SYSTEM_PROMPT_HE : FREE_SYSTEM_PROMPT_EN)

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
        if (block.name === 'create_activity') {
          confirmation = `Create activity: ${block.input.name} on ${block.input.day_of_week}`
        } else if (block.name === 'plan_meals') {
          confirmation = 'Generating meal plan...'
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
          params: block.input,
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
