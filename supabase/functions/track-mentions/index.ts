import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { project_id } = await req.json()

    if (!project_id) {
      return new Response(JSON.stringify({ error: 'project_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single()

    const { data: queries } = await supabase
      .from('tracked_queries')
      .select('*')
      .eq('project_id', project_id)
      .eq('is_active', true)

    if (!project || !queries?.length) {
      return new Response(JSON.stringify({ error: 'Project or queries not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const brandNames = project.brand_names?.length
      ? project.brand_names
      : [project.brand_name, project.name, project.domain].filter(Boolean)

    const competitors = project.competitors ?? []

    const results: PromiseSettledResult<any>[] = []
    const chunks = chunkArray(queries, 5)

    for (const chunk of chunks) {
      const batch = await Promise.allSettled(
        chunk.map((q: any) => trackQuery(q, project_id, brandNames, competitors))
      )
      results.push(...batch)
      await sleep(1000)
    }

    await computeVisibilityScores(project_id)

    const succeeded = results.filter(r => r.status === 'fulfilled').length
    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      succeeded,
      failed: results.length - succeeded
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Track mentions error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function trackQuery(query: any, projectId: string, brandNames: string[], competitors: string[]) {
  let rawResponse: string

  switch (query.platform) {
    case 'perplexity':
      rawResponse = await queryPerplexity(query.query)
      break
    case 'gemini':
      rawResponse = await queryGemini(query.query)
      break
    case 'bing':
      rawResponse = await queryBing(query.query)
      break
    default:
      throw new Error(`Unknown platform: ${query.platform}`)
  }

  const parsed = parseMention(rawResponse, brandNames, competitors)

  // Sentiment via OpenRouter (uses existing OPENROUTER_API_KEY)
  const { sentiment, sentimentScore } = parsed.brandMentioned
    ? await analyzeSentiment(rawResponse, brandNames)
    : { sentiment: 'neutral' as const, sentimentScore: 0 }

  await supabase.from('mentions').insert({
    project_id:            projectId,
    query_id:              query.id,
    platform:              query.platform,
    query_text:            query.query,
    raw_response:          rawResponse,
    snippet:               parsed.snippet,
    brand_mentioned:       parsed.brandMentioned,
    brand_position:        parsed.brandPosition,
    sentiment,
    sentiment_score:       sentimentScore,
    competitors_mentioned: parsed.competitorsMentioned,
    sources:               [],
  })

  return parsed
}

// --- API CALLS ---

async function queryPerplexity(query: string): Promise<string> {
  const apiKey = Deno.env.get('PERPLEXITY_API_KEY')
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY not set')

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: query }],
      max_tokens: 1024,
    }),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

async function queryGemini(query: string): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: query }] }],
        tools: [{ googleSearch: {} }],
      }),
    }
  )
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function queryBing(query: string): Promise<string> {
  const apiKey = Deno.env.get('BING_API_KEY')
  if (!apiKey) throw new Error('BING_API_KEY not set')

  const res = await fetch(
    `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=5`,
    { headers: { 'Ocp-Apim-Subscription-Key': apiKey } }
  )
  const data = await res.json()
  return data.webPages?.value
    ?.map((r: any) => `${r.name}: ${r.snippet}`)
    .join('\n') ?? ''
}

// --- PARSER ---

function parseMention(response: string, brandNames: string[], competitors: string[]) {
  const lowerResponse = response.toLowerCase()
  const brandMentioned = brandNames.some(name =>
    lowerResponse.includes(name.toLowerCase())
  )

  const competitorsMentioned = competitors.filter(c =>
    lowerResponse.includes(c.toLowerCase())
  )

  let brandPosition: number | null = null
  let snippet: string | null = null

  if (brandMentioned) {
    const sentences = response.split(/[.!?\n]+/)
    const idx = sentences.findIndex(s =>
      brandNames.some(name => s.toLowerCase().includes(name.toLowerCase()))
    )
    brandPosition = idx >= 0 ? idx + 1 : null

    for (const name of brandNames) {
      const i = lowerResponse.indexOf(name.toLowerCase())
      if (i >= 0) {
        const start = Math.max(0, i - 80)
        const end = Math.min(response.length, i + name.length + 120)
        snippet = '...' + response.slice(start, end).trim() + '...'
        break
      }
    }
  }

  return { brandMentioned, brandPosition, snippet, competitorsMentioned }
}

async function analyzeSentiment(
  response: string,
  brandNames: string[]
): Promise<{ sentiment: 'positive' | 'neutral' | 'negative'; sentimentScore: number }> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        max_tokens: 60,
        messages: [
          {
            role: 'system',
            content: `You analyze sentiment of AI-generated responses toward a brand. Respond ONLY with valid JSON: {"sentiment":"positive"|"neutral"|"negative","score":-1.0 to 1.0}`,
          },
          {
            role: 'user',
            content: `Brand: ${brandNames[0]}\n\nResponse:\n${response.slice(0, 800)}`,
          },
        ],
      }),
    })

    const data = await res.json()
    const parsed = JSON.parse(data.choices[0].message.content)
    return { sentiment: parsed.sentiment, sentimentScore: parsed.score }
  } catch {
    return { sentiment: 'neutral', sentimentScore: 0 }
  }
}

// --- SCORE ENGINE ---

async function computeVisibilityScores(projectId: string) {
  const today = new Date().toISOString().split('T')[0]

  const { data: mentions } = await supabase
    .from('mentions')
    .select('*')
    .eq('project_id', projectId)
    .gte('queried_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  if (!mentions?.length) return

  const byPlatform = groupBy(mentions, 'platform')

  for (const [platform, platformMentions] of Object.entries(byPlatform)) {
    const total = platformMentions.length
    const cited = platformMentions.filter((m: any) => m.brand_mentioned)
    const citationRate = cited.length / total

    const positions = cited
      .map((m: any) => m.brand_position)
      .filter((p: any) => p !== null) as number[]
    const avgPosition = positions.length
      ? positions.reduce((a, b) => a + b, 0) / positions.length
      : null

    const citationScore = citationRate * 50
    const positionScore = avgPosition
      ? Math.max(0, 30 - (avgPosition - 1) * 7.5)
      : 0

    const sentimentScores = cited.map((m: any) => m.sentiment_score ?? 0)
    const avgSentiment = sentimentScores.length
      ? sentimentScores.reduce((a: number, b: number) => a + b, 0) / sentimentScores.length
      : 0
    const sentimentScore = ((avgSentiment + 1) / 2) * 20

    const finalScore = Math.round(citationScore + positionScore + sentimentScore)

    await supabase.from('visibility_scores').upsert({
      project_id:      projectId,
      platform,
      date:            today,
      score:           Math.min(100, finalScore),
      citation_rate:   Math.round(citationRate * 100) / 100,
      avg_position:    avgPosition ? Math.round(avgPosition * 10) / 10 : null,
      total_queries:   total,
      brand_mentions:  cited.length,
      positive_count:  platformMentions.filter((m: any) => m.sentiment === 'positive').length,
      neutral_count:   platformMentions.filter((m: any) => m.sentiment === 'neutral').length,
      negative_count:  platformMentions.filter((m: any) => m.sentiment === 'negative').length,
    }, { onConflict: 'project_id,platform,date' })
  }
}

// --- UTILS ---

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  )
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key])
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {} as Record<string, T[]>)
}
