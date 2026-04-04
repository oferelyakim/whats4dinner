import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const { url, image_base64 } = body

    if (!url && !image_base64) {
      return new Response(JSON.stringify({ error: 'URL or image is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let content: { type: string; text?: string; source?: object }[]

    if (image_base64) {
      // Photo import: send image to Claude
      const mediaType = image_base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
      content = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: image_base64,
          },
        },
        {
          type: 'text',
          text: `Extract the recipe from this image. Return a JSON object with these fields:
{
  "title": "recipe name",
  "description": "brief description",
  "instructions": "step by step instructions as plain text, each step on a new line",
  "prep_time_min": number or null,
  "cook_time_min": number or null,
  "servings": number or null,
  "ingredients": [
    { "name": "ingredient name", "quantity": number or null, "unit": "unit or empty string" }
  ]
}
Return ONLY the JSON, no markdown, no explanation.`,
        },
      ]
    } else {
      // URL import: fetch page and send to Claude
      const pageResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Whats4Dinner/1.0)',
          Accept: 'text/html',
        },
      })

      if (!pageResponse.ok) {
        return new Response(JSON.stringify({ error: `Failed to fetch URL: ${pageResponse.status}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let html = await pageResponse.text()
      // Trim to avoid hitting token limits - keep first 30K chars
      if (html.length > 30000) html = html.substring(0, 30000)

      content = [
        {
          type: 'text',
          text: `Extract the recipe from this HTML page. Return a JSON object with these fields:
{
  "title": "recipe name",
  "description": "brief description",
  "instructions": "step by step instructions as plain text, each step on a new line",
  "image_url": "URL of the recipe image or null",
  "prep_time_min": number or null,
  "cook_time_min": number or null,
  "servings": number or null,
  "ingredients": [
    { "name": "ingredient name", "quantity": number or null, "unit": "unit or empty string" }
  ]
}
Return ONLY the JSON, no markdown, no explanation.

HTML:
${html}`,
        },
      ]
    }

    // Call Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{ role: 'user', content }],
      }),
    })

    if (!claudeResponse.ok) {
      const err = await claudeResponse.text()
      console.error('Claude API error:', err)
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const claudeData = await claudeResponse.json()
    const responseText = claudeData.content?.[0]?.text || ''

    // Parse the JSON response from Claude
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Could not parse recipe from response' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const recipe = JSON.parse(jsonMatch[0])

    return new Response(JSON.stringify({ ...recipe, source_url: url || '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
