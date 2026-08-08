import { useMemo } from 'react'
import { useActiveProject } from '@/hooks/useProjects'
import {
  useVisibilityScores,
  useVisibilityHistory,
  useRecentMentions,
  useTriggerTracking,
} from '@/hooks/useTrackingData'
import { IconMessage, IconChart } from './Icons'

const PLATFORM_LABEL: Record<string, string> = {
  chatgpt: 'ChatGPT',
  openai: 'ChatGPT',
  gemini: 'Gemini',
  google: 'Gemini',
  perplexity: 'Perplexity',
  claude: 'Claude',
}

const PLATFORM_COLOR: Record<string, string> = {
  chatgpt: '#1f8a5f',
  openai: '#1f8a5f',
  gemini: '#2e3a8c',
  google: '#2e3a8c',
  perplexity: '#4a58c9',
  claude: '#b9700a',
}

const label = (p: string) => PLATFORM_LABEL[p?.toLowerCase()] || (p ? p[0].toUpperCase() + p.slice(1) : 'Unknown')
const color = (p: string) => PLATFORM_COLOR[p?.toLowerCase()] || '#2e3a8c'

/** Wrap every occurrence of the brand name in <b> so it reads like the AI answer highlight. */
function highlight(text: string, brand?: string | null) {
  if (!brand) return text
  const parts = text.split(new RegExp(`(${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === brand.toLowerCase() ? <b key={i}>{part}</b> : <span key={i}>{part}</span>
  )
}

export function Results() {
  const { project } = useActiveProject()
  const { data: scores = [], isLoading: scoresLoading } = useVisibilityScores()
  const { data: history = [] } = useVisibilityHistory(30)
  const { data: mentions = [], isLoading: mentionsLoading } = useRecentMentions(10)
  const trigger = useTriggerTracking()

  const brand = project?.brand_name || project?.name

  // One gauge per platform scored today.
  const gauges = useMemo(
    () =>
      scores.map((s: any) => ({
        platform: s.platform,
        score: Math.round(Number(s.score) || 0),
        citationRate: s.citation_rate != null ? Math.round(Number(s.citation_rate) * 100) : null,
        brandMentions: s.brand_mentions ?? 0,
      })),
    [scores]
  )

  const chart = useMemo(() => {
    if (!history.length) return null
    const byDate = new Map<string, number[]>()
    history.forEach((h: any) => {
      if (!byDate.has(h.date)) byDate.set(h.date, [])
      byDate.get(h.date)!.push(Number(h.score) || 0)
    })
    const series = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, s]) => ({ date, value: s.reduce((x, y) => x + y, 0) / s.length }))
    if (series.length < 2) return null
    const max = Math.max(...series.map((s) => s.value), 1)
    return {
      points: series.map((s, i) => `${(i / (series.length - 1)) * 900},${130 - (s.value / max) * 115}`).join(' '),
      first: series[0],
      last: series[series.length - 1],
    }
  }, [history])

  const loading = scoresLoading || mentionsLoading
  const hasAnything = gauges.length > 0 || mentions.length > 0

  return (
    <section>
      <div className="top-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1>Results</h1>
          <p>Where you show up, and what AI actually says about you</p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          disabled={trigger.isPending}
          onClick={() => trigger.mutate()}
        >
          {trigger.isPending ? 'Checking…' : 'Run a check now'}
        </button>
      </div>

      {loading ? (
        <div className="card">
          <p style={{ fontSize: '13.5px', color: 'var(--ink-soft)', margin: 0 }}>Loading your results…</p>
        </div>
      ) : !hasAnything ? (
        <div className="card empty">
          <div className="icon-tile indigo" style={{ width: '52px', height: '52px', margin: '0 auto 14px' }}>
            <IconChart />
          </div>
          <h3>Nothing to show yet</h3>
          <p>
            Your visibility scores appear here once your first pieces of content are live and AI
            assistants have had a chance to index them — usually within a week.
          </p>
          <button className="btn btn-primary btn-sm" disabled={trigger.isPending} onClick={() => trigger.mutate()}>
            {trigger.isPending ? 'Checking…' : 'Run the first check'}
          </button>
        </div>
      ) : (
        <>
          {gauges.length > 0 && (
            <>
              <div className="section-label">Visibility by assistant</div>
              <div className="gauges">
                {gauges.map((g) => (
                  <div className="gauge-card" key={g.platform}>
                    <div
                      className="ring"
                      style={{ background: `conic-gradient(${color(g.platform)} 0% ${g.score}%, #eceefa ${g.score}% 100%)` }}
                    >
                      <span className="ring-val">{g.score}%</span>
                    </div>
                    <div>
                      <div className="g-name">{label(g.platform)}</div>
                      <div className="g-check" style={{ color: g.brandMentions > 0 ? 'var(--green)' : 'var(--ink-soft)' }}>
                        {g.brandMentions > 0
                          ? `✓ ${g.brandMentions} mention${g.brandMentions > 1 ? 's' : ''}`
                          : 'No mentions yet'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {mentions.length > 0 && (
            <>
              <div className="section-label">What AI is actually saying</div>
              {mentions.slice(0, 6).map((m: any) => (
                <div className="answer-mock" key={m.id}>
                  <div className="q">
                    <IconMessage />
                    “{m.query_text}”
                    <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: '11.5px' }}>
                      {label(m.platform)}
                    </span>
                  </div>
                  <div className="a">{highlight(m.snippet || m.raw_response?.slice(0, 320) || '', brand)}</div>
                </div>
              ))}
            </>
          )}

          <div className="section-label">Visibility over time</div>
          <div className="card">
            {chart ? (
              <>
                <svg viewBox="0 0 900 150" width="100%" height="130">
                  <polyline points={chart.points} fill="none" stroke="#2e3a8c" strokeWidth="3" />
                </svg>
                <div className="legend">
                  <span><i className="dot" style={{ background: '#2e3a8c' }} />Average visibility score</span>
                  <span>
                    {Math.round(chart.first.value)}% → {Math.round(chart.last.value)}% over{' '}
                    {history.length ? '30 days' : ''}
                  </span>
                </div>
              </>
            ) : (
              <p style={{ fontSize: '13.5px', color: 'var(--ink-soft)', margin: 0 }}>
                Need at least two days of tracking before a trend line means anything. Check back tomorrow.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
