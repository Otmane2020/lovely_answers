import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useActiveProject } from '@/hooks/useProjects'
import { useArticles } from '@/hooks/useArticles'
import { useAnswers } from '@/hooks/useAnswers'
import { useIntegrations } from '@/hooks/useIntegrations'
import { useRecentMentions, useVisibilityHistory } from '@/hooks/useTrackingData'
import type { DashboardTab } from '@/views/GEODashboard'

interface TodayProps {
  onNavigate: (tab: DashboardTab) => void
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function timeAgo(iso: string) {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days === 0) return `today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function Today({ onNavigate }: TodayProps) {
  const { user } = useAuth()
  const { project } = useActiveProject()
  const { data: articles = [], isLoading: articlesLoading } = useArticles()
  const { data: answers = [], isLoading: answersLoading } = useAnswers()
  const { data: integrations = [] } = useIntegrations()
  const { data: mentions = [] } = useRecentMentions(100)
  const { data: history = [] } = useVisibilityHistory(30)

  const loading = articlesLoading || answersLoading

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ||
    project?.brand_name ||
    project?.name ||
    'there'

  const cmsIntegration = integrations.find(
    (i) => !['google_business', 'google_search_console'].includes(i.platform)
  )
  const cmsConnected = !!cmsIntegration?.is_connected

  const stats = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()

    const mentionsThisMonth = mentions.filter(
      (m: any) => m.queried_at && new Date(m.queried_at).getTime() >= monthStart
    ).length
    const mentionsLastMonth = mentions.filter((m: any) => {
      if (!m.queried_at) return false
      const t = new Date(m.queried_at).getTime()
      return t >= prevMonthStart && t < monthStart
    }).length

    const publishedArticles = articles.filter((a: any) => a.status === 'published')
    const pendingArticles = articles.filter((a: any) => a.status !== 'published')
    const liveAnswers = answers.filter((a: any) => a.is_public)
    const pendingAnswers = answers.filter((a: any) => !a.is_public)

    // Everything written but not yet live — the number that matters if the CMS is unlinked.
    const waiting = pendingArticles.length + pendingAnswers.length

    const trendLabel =
      mentionsLastMonth > 0
        ? `${(mentionsThisMonth / mentionsLastMonth).toFixed(1)}×`
        : mentionsThisMonth > 0
        ? 'new'
        : '—'

    return {
      mentionsThisMonth,
      trendLabel,
      waiting,
      liveCount: publishedArticles.length + liveAnswers.length,
    }
  }, [mentions, articles, answers])

  // Anything that went live in the last 7 days, newest first.
  const recentlyPublished = useMemo(() => {
    const since = Date.now() - 7 * 86400000
    const fromArticles = articles
      .filter((a: any) => a.status === 'published' && a.updated_at && new Date(a.updated_at).getTime() >= since)
      .map((a: any) => ({ id: a.id, title: a.title, at: a.updated_at, kind: 'Article', url: a.published_url }))
    const fromAnswers = answers
      .filter((a: any) => a.is_public && a.published_at && new Date(a.published_at).getTime() >= since)
      .map((a: any) => ({ id: a.id, title: a.question, at: a.published_at, kind: 'Answer', url: a.published_url }))
    return [...fromArticles, ...fromAnswers]
      .sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())
      .slice(0, 5)
  }, [articles, answers])

  // Real blockers only — no invented busywork.
  const needsInput = useMemo(() => {
    const items: { id: string; tone: string; text: string; tab: DashboardTab }[] = []
    if (!cmsConnected) {
      items.push({
        id: 'cms',
        tone: 'var(--red)',
        text: 'Your site is not connected — nothing can publish automatically',
        tab: 'settings',
      })
    }
    if (!project?.business_description) {
      items.push({
        id: 'desc',
        tone: 'var(--amber)',
        text: 'Add a business description so generated content sounds like you',
        tab: 'settings',
      })
    }
    if (!integrations.some((i) => i.platform === 'google_business' && i.is_connected)) {
      items.push({
        id: 'gmb',
        tone: 'var(--amber)',
        text: 'Connect Google Business Profile to keep your listing consistent',
        tab: 'presence',
      })
    }
    return items
  }, [cmsConnected, project, integrations])

  // Build the reach line from real visibility history (average score per day).
  const chartPoints = useMemo(() => {
    if (!history.length) return null
    const byDate = new Map<string, number[]>()
    history.forEach((h: any) => {
      if (!byDate.has(h.date)) byDate.set(h.date, [])
      byDate.get(h.date)!.push(Number(h.score) || 0)
    })
    const series = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, scores]) => scores.reduce((s, v) => s + v, 0) / scores.length)
    if (series.length < 2) return null
    const max = Math.max(...series, 1)
    return series
      .map((v, i) => `${(i / (series.length - 1)) * 540},${120 - (v / max) * 100}`)
      .join(' ')
  }, [history])

  if (loading) {
    return (
      <section>
        <div className="top-header">
          <h1>{greeting()}, {firstName}</h1>
          <p>Loading your latest activity…</p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="top-header">
        <h1>{greeting()}, {firstName}</h1>
        <p>Here's what's worth your attention today</p>
      </div>

      <div className="impact-hero">
        <div className="split">
          <div>
            <div className="num mono">{stats.mentionsThisMonth}</div>
            <div className="lbl">
              {stats.mentionsThisMonth === 0
                ? 'AI mentions tracked this month — tracking starts once content is live'
                : 'times an AI mentioned you this month'}
            </div>
          </div>
          <div>
            <div className="num mono">{stats.trendLabel}</div>
            <div className="lbl">visibility vs. last month</div>
          </div>
        </div>
        <button
          className="btn btn-primary"
          style={{ background: '#fff', color: 'var(--primary-deep)' }}
          onClick={() => onNavigate('results')}
        >
          See details →
        </button>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-head">
          <div>
            <h2>Published automatically</h2>
            <p className="sub">Everything here went live without needing your approval</p>
          </div>
          {recentlyPublished.length > 0 && (
            <span className="pill">✓ {recentlyPublished.length} this week</span>
          )}
        </div>
        {recentlyPublished.length === 0 ? (
          <p style={{ fontSize: '13.5px', color: 'var(--ink-soft)', margin: 0 }}>
            Nothing published in the last 7 days.{' '}
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: '8px' }}
              onClick={() => onNavigate('content')}
            >
              Go to Content
            </button>
          </p>
        ) : (
          recentlyPublished.map((item) => (
            <div className="task-row" key={item.id}>
              <span className="task-dot" style={{ background: 'var(--green)' }} />
              <span className="t-title">
                {item.kind} “{item.title}” — {timeAgo(item.at)}
              </span>
              {item.url ? (
                <a className="t-meta" href={item.url} target="_blank" rel="noreferrer">View →</a>
              ) : (
                <span className="t-meta" style={{ cursor: 'pointer' }} onClick={() => onNavigate('content')}>
                  Content →
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h2>Needs your input</h2>
        <p className="sub">Only the calls an AI shouldn't make on your behalf</p>
        {needsInput.length === 0 ? (
          <p style={{ fontSize: '13.5px', color: 'var(--ink-soft)', margin: 0 }}>
            Nothing needs you right now — everything is running on autopilot.
          </p>
        ) : (
          needsInput.map((item) => (
            <div
              className="task-row"
              key={item.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onNavigate(item.tab)}
            >
              <span className="task-dot" style={{ background: item.tone }} />
              <span className="t-title">{item.text}</span>
              <span className="t-meta">{item.tab[0].toUpperCase() + item.tab.slice(1)} →</span>
            </div>
          ))
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Visibility trend</h2>
              <p className="sub">Average score across tracked assistants, last 30 days</p>
            </div>
          </div>
          {chartPoints ? (
            <>
              <svg viewBox="0 0 560 150" width="100%" height="130">
                <polyline points={chartPoints} fill="none" stroke="#2e3a8c" strokeWidth="3" />
              </svg>
              <div className="legend">
                <span><i className="dot" style={{ background: '#2e3a8c' }} />Visibility score</span>
              </div>
            </>
          ) : (
            <p style={{ fontSize: '13.5px', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
              Not enough tracking data yet. Scores appear here once your content has been live
              long enough for assistants to index it.
            </p>
          )}
        </div>
        <div className="card">
          <h2>Where you stand</h2>
          <p className="sub">In plain terms</p>
          <p style={{ fontSize: '13.5px', color: 'var(--ink-soft)', lineHeight: '1.6' }}>
            {stats.liveCount === 0
              ? 'Nothing is live yet. Once your first pieces publish, assistants start picking them up — usually within a week.'
              : `${stats.liveCount} piece${stats.liveCount > 1 ? 's' : ''} of your content ${stats.liveCount > 1 ? 'are' : 'is'} live${
                  stats.waiting > 0 ? `, and ${stats.waiting} more ${stats.waiting > 1 ? 'are' : 'is'} waiting to go out` : ''
                }.`}
          </p>
        </div>
      </div>
    </section>
  )
}
