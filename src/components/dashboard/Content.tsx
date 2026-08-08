import { useState, useMemo } from 'react'
import { useArticles } from '@/hooks/useArticles'
import { useAnswers } from '@/hooks/useAnswers'
import { useGeoContents } from '@/hooks/useGeoContents'
import { useShoppingProducts } from '@/hooks/useShoppingProducts'
import { useIntegrations } from '@/hooks/useIntegrations'
import { IconFlame, IconFile, IconMessage, IconTag, IconList, IconCalendar } from './Icons'
import { ContentPreviewModal } from './ContentPreviewModal'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAME = (y: number, m: number) =>
  new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

// geo_contents.content_type is a real stored column ('geo' | 'seo' | 'aeo'
// | 'local_aeo'), written by generate-30-gso-contents which owns the 30-day
// rotation. Read it directly instead of guessing the angle from the date.
// articles is shared by the SEO track (generate-articles, standalone) and
// the AEO track (generate-aeo-article, linked from an answer) — see the
// aeoArticleIds check below for how those are told apart.
const ANGLE_LABEL: Record<string, string> = {
  geo: 'GEO', aeo: 'AEO', seo: 'SEO', local_aeo: 'Local AEO', aeo_shopping: 'Shopping', product: 'Shopping',
}

type Status = 'live' | 'wait' | 'draft'
type Filter = 'all' | Status

interface Row {
  id: string
  title: string
  format: string
  icon: JSX.Element
  where: string
  status: Status
  url: string | null
  date: string | null
  kind: 'article' | 'answer' | 'page' | 'product'
  raw: any
}

const STATUS_LABEL: Record<Status, string> = { live: 'Live', wait: 'Waiting', draft: 'Draft' }

export function Content() {
  const [viewMode, setViewMode] = useState<'list' | 'cal'>('list')
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)
  const [previewRow, setPreviewRow] = useState<Row | null>(null)
  const PAGE_SIZE = 25
  const today = new Date()
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())

  const { data: articles = [], isLoading: la } = useArticles()
  const { data: answers = [], isLoading: lb } = useAnswers()
  const { data: geoContents = [], isLoading: lc } = useGeoContents()
  const { data: shoppingProducts = [] } = useShoppingProducts()
  const { data: integrations = [] } = useIntegrations()

  const loading = la || lb || lc

  const hasProducts = shoppingProducts.length > 0
  const rows: Row[] = useMemo(() => {
    // articles is shared by two producers: generate-aeo-article (writes
    // answers.article_id -> this article, no linked_answer_id set) and
    // generate-articles / SEO track (standalone, no answer link at all).
    // Either signal means AEO; absence of both means SEO.
    const aeoArticleIds = new Set(
      answers.filter((a: any) => a.article_id).map((a: any) => a.article_id)
    )
    const fromArticles: Row[] = articles.map((a: any) => ({
      id: `art-${a.id}`,
      title: a.title,
      format: a.linked_answer_id || aeoArticleIds.has(a.id) ? 'Article · AEO' : 'Article · SEO',
      icon: <IconFile />,
      where: a.gsc_indexed ? 'Your site · Google' : 'Your site',
      status: a.status === 'published' ? 'live' : a.scheduled_date ? 'wait' : 'draft',
      url: a.published_url || null,
      date: a.scheduled_date || a.created_at || null,
      kind: 'article',
      raw: a,
    }))

    const fromAnswers: Row[] = answers.map((a: any) => ({
      id: `ans-${a.id}`,
      title: a.question,
      format: 'Answer · AEO',
      icon: <IconMessage />,
      where: (a.platforms && a.platforms.length ? a.platforms : ['ChatGPT']).join(' · '),
      status: a.is_public ? 'live' : a.scheduled_date ? 'wait' : 'draft',
      url: a.published_url || null,
      date: a.scheduled_date || a.created_at || null,
      kind: 'answer',
      raw: a,
    }))

    const fromGeo: Row[] = geoContents.map((g: any) => ({
      id: `geo-${g.id}`,
      kind: 'page',
      raw: g,
      title: g.title || g.topic,
      format: `Page · ${ANGLE_LABEL[g.content_type] || 'GEO'}`,
      icon: <IconTag />,
      where: g.website ? 'Your site' : '—',
      status: g.published_at ? 'live' : g.scheduled_date ? 'wait' : 'draft',
      url: g.published_url || null,
      date: g.scheduled_date || g.created_at || null,
    }))

    // Only enriched products (generate-product-ai has actually run on them)
    // count as a real "Shopping" piece of content — an imported-but-untouched
    // product isn't AEO-ready content yet.
    const fromProducts: Row[] = shoppingProducts
      .filter((p: any) => p.ai_title || p.ai_description)
      .map((p: any) => ({
        id: `prod-${p.id}`,
        kind: 'product',
        raw: p,
        title: p.ai_title || p.title,
        format: 'Product · Shopping',
        icon: <IconTag />,
        where: p.product_url ? 'Your site' : '—',
        status: p.published_at ? 'live' : p.scheduled_date ? 'wait' : 'draft',
        url: p.published_url || null,
        date: p.scheduled_date || p.created_at || null,
      }))

    return [...fromArticles, ...fromAnswers, ...fromGeo, ...fromProducts].sort((x, y) => {
      if (!x.date) return 1
      if (!y.date) return -1
      return new Date(y.date).getTime() - new Date(x.date).getTime()
    })
  }, [articles, answers, geoContents, shoppingProducts])

  const counts = useMemo(
    () => ({
      live: rows.filter((r) => r.status === 'live').length,
      wait: rows.filter((r) => r.status === 'wait').length,
      draft: rows.filter((r) => r.status === 'draft').length,
    }),
    [rows]
  )

  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter)
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const changeFilter = (f: Filter | ((prev: Filter) => Filter)) => {
    setFilter(f)
    setPage(1)
  }

  // Publishing streak: did anything go live on each of the last 5 days?
  const streak = useMemo(() => {
    const days: ('hit' | 'partial' | 'miss')[] = []
    for (let i = 4; i >= 0; i--) {
      const day = new Date()
      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - i)
      const next = day.getTime() + 86400000
      const live = rows.filter(
        (r) => r.status === 'live' && r.date && new Date(r.date).getTime() >= day.getTime() && new Date(r.date).getTime() < next
      ).length
      const planned = rows.filter(
        (r) => r.status === 'wait' && r.date && new Date(r.date).getTime() >= day.getTime() && new Date(r.date).getTime() < next
      ).length
      days.push(live > 0 ? 'hit' : planned > 0 ? 'partial' : 'miss')
    }
    return days
  }, [rows])

  const streakColor = (s: 'hit' | 'partial' | 'miss') =>
    s === 'hit' ? 'var(--green)' : s === 'partial' ? 'var(--amber)' : '#eceefa'

  const publishedLast30 = rows.filter(
    (r) => r.status === 'live' && r.date && Date.now() - new Date(r.date).getTime() < 30 * 86400000
  ).length
  const pace = (publishedLast30 / 30).toFixed(1)

  const history = rows
    .filter((r) => r.status === 'live' && r.date)
    .slice(0, 6)

  // One dot per day: live beats waiting beats nothing, for that day's status.
  const calDays = useMemo(() => {
    const byDay = new Map<number, 'live' | 'wait'>()
    rows.forEach((r) => {
      if (!r.date) return
      const d = new Date(r.date)
      if (d.getFullYear() !== calYear || d.getMonth() !== calMonth) return
      const day = d.getDate()
      const current = byDay.get(day)
      if (r.status === 'live') byDay.set(day, 'live')
      else if (r.status === 'wait' && current !== 'live') byDay.set(day, 'wait')
    })

    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    // JS getDay(): 0=Sun..6=Sat. Mockup's grid starts on Monday, so shift Sunday to the end.
    const firstWeekday = (new Date(calYear, calMonth, 1).getDay() + 6) % 7
    const cells: ({ day: number; status: 'live' | 'wait' | 'none' } | null)[] = []
    for (let i = 0; i < firstWeekday; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, status: byDay.get(d) || 'none' })
    return cells
  }, [rows, calYear, calMonth])

  const shiftMonth = (delta: number) => {
    const d = new Date(calYear, calMonth + delta, 1)
    setCalYear(d.getFullYear())
    setCalMonth(d.getMonth())
  }

  return (
    <section>
      <div className="top-header">
        <h1>Content</h1>
        <p>One single stream — your site, ChatGPT, Gemini and Perplexity all fed by the same asset</p>
      </div>

      <div
        className="card"
        style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="icon-tile gold" style={{ width: '46px', height: '46px' }}>
            <IconFlame />
          </div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '14.5px' }}>
              {publishedLast30 === 0 && counts.wait > 0
                ? `Nothing published yet — ${counts.wait} piece${counts.wait > 1 ? 's' : ''} ready and waiting`
                : `Current pace: ${pace} piece${pace === '1.0' ? '' : 's'} of content a day`}
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>
              {publishedLast30 === 0 && counts.wait > 0
                ? "Connect your site in Settings to start publishing what's already generated."
                : `${publishedLast30} published in the last 30 days. Each piece is written once and works everywhere — that's what GEO means.`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          {streak.map((s, i) => (
            <span
              key={i}
              className="dot"
              style={{ width: '22px', height: '8px', borderRadius: '4px', background: streakColor(s) }}
            />
          ))}
        </div>
      </div>

      <div className="filters">
        <button className={`chip ${viewMode === 'list' ? '' : 'off'}`} onClick={() => setViewMode('list')}>
          <IconList /> List
        </button>
        <button className={`chip ${viewMode === 'cal' ? '' : 'off'}`} onClick={() => setViewMode('cal')}>
          <IconCalendar /> Calendar
        </button>
        <span style={{ flex: 1 }} />
        {/* Mockup shows exactly these three as plain counts, no "All" pill.
            Clicking the active one toggles back to 'all' instead of adding a
            fourth chip that isn't in the design. */}
        <button
          className={`chip ${filter === 'live' ? '' : 'off'}`}
          onClick={() => changeFilter((f) => (f === 'live' ? 'all' : 'live'))}
        >
          Live ({counts.live})
        </button>
        <button
          className={`chip ${filter === 'wait' ? '' : 'off'}`}
          onClick={() => changeFilter((f) => (f === 'wait' ? 'all' : 'wait'))}
        >
          Waiting ({counts.wait})
        </button>
        <button
          className={`chip ${filter === 'draft' ? '' : 'off'}`}
          onClick={() => changeFilter((f) => (f === 'draft' ? 'all' : 'draft'))}
        >
          Draft ({counts.draft})
        </button>
      </div>

      {loading ? (
        <div className="card">
          <p style={{ fontSize: '13.5px', color: 'var(--ink-soft)', margin: 0 }}>Loading content…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="card empty">
          <div className="icon-tile indigo" style={{ width: '52px', height: '52px', margin: '0 auto 14px' }}>
            <IconFile />
          </div>
          <h3>No content yet</h3>
          <p>
            Once your project starts generating, every article, answer and product page shows up here
            in one stream.
          </p>
        </div>
      ) : viewMode === 'cal' ? (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-head">
            <div>
              <h2>{MONTH_NAME(calYear, calMonth)}</h2>
              <p className="sub">One dot = one piece of content published that day</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => shiftMonth(-1)}>
                ‹ {MONTH_NAME(calYear, calMonth === 0 ? 11 : calMonth - 1).split(' ')[0]}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => shiftMonth(1)}>
                {MONTH_NAME(calYear, calMonth === 11 ? 0 : calMonth + 1).split(' ')[0]} ›
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '6px', marginTop: '6px' }}>
            {WEEKDAYS.map((w) => (
              <div key={w} style={{ fontSize: '11px', color: 'var(--ink-soft)', textAlign: 'center' }}>{w}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '6px', marginTop: '6px' }}>
            {calDays.map((cell, i) =>
              cell ? (
                <div
                  key={i}
                  style={{
                    aspectRatio: '1', borderRadius: '8px', background: '#fafafd', border: '1px solid var(--line)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', color: 'var(--ink-soft)', gap: '3px',
                  }}
                >
                  {cell.day}
                  <span
                    style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      background: cell.status === 'live' ? 'var(--green)' : cell.status === 'wait' ? 'var(--amber)' : '#e2e3ee',
                    }}
                  />
                </div>
              ) : (
                <div key={i} />
              )
            )}
          </div>
          <div className="legend" style={{ marginTop: '14px' }}>
            <span><i className="dot" style={{ background: 'var(--green)' }} />Published</span>
            <span><i className="dot" style={{ background: 'var(--amber)' }} />Waiting</span>
            <span><i className="dot" style={{ background: '#e2e3ee' }} />Nothing that day</span>
          </div>
        </div>
      ) : viewMode === 'list' ? (
        <div className="card">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Content</th>
                  <th>Format</th>
                  <th>Where it works</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td><span className="src-tag">{row.icon} {row.format}</span></td>
                    <td className="src-tag">{row.where}</td>
                    <td><span className={`status ${row.status}`}>{STATUS_LABEL[row.status]}</span></td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        title={row.url ? 'Open published page' : 'Preview'}
                        onClick={() =>
                          row.url ? window.open(row.url, '_blank', 'noopener') : setPreviewRow(row)
                        }
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ‹ Previous
              </button>
              <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                Page {page} of {totalPages} · {visible.length} items
              </span>
              <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next ›
              </button>
            </div>
          )}
        </div>
      ) : null}

      {history.length > 0 && (
        <>
          <div className="section-label">History</div>
          <div className="card">
            {history.map((row) => (
              <div className="task-row" key={`h-${row.id}`}>
                <span className="task-dot" style={{ background: 'var(--green)' }} />
                <span className="t-title">
                  {row.date ? new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''} — “{row.title}” published
                </span>
                <span className="t-meta">GEO</span>
              </div>
            ))}
          </div>
        </>
      )}

      {previewRow?.kind === 'article' && (
        <ContentPreviewModal
          kind="article"
          title={previewRow.raw.title}
          meta={[previewRow.raw.meta_description, previewRow.raw.word_count ? `${previewRow.raw.word_count} words` : null]
            .filter(Boolean)
            .join(' · ')}
          body={previewRow.raw.html_content || previewRow.raw.content || ''}
          isHtml={!!previewRow.raw.html_content}
          onClose={() => setPreviewRow(null)}
        />
      )}
      {previewRow?.kind === 'answer' && (
        <ContentPreviewModal
          kind="answer"
          title={previewRow.raw.question}
          meta={(previewRow.raw.platforms?.length ? previewRow.raw.platforms : ['ChatGPT']).join(' · ')}
          body={previewRow.raw.answer || ''}
          isHtml={false}
          bullets={previewRow.raw.supporting_content?.bullets}
          faq={previewRow.raw.supporting_content?.faq}
          onClose={() => setPreviewRow(null)}
        />
      )}
      {previewRow?.kind === 'page' && (
        <ContentPreviewModal
          kind="article"
          title={previewRow.raw.title || previewRow.raw.topic}
          meta={previewRow.raw.meta_description || ''}
          body={previewRow.raw.html_content || previewRow.raw.content || ''}
          isHtml={!!previewRow.raw.html_content}
          onClose={() => setPreviewRow(null)}
        />
      )}
      {previewRow?.kind === 'product' && (
        <ContentPreviewModal
          kind="answer"
          title={previewRow.raw.ai_title || previewRow.raw.title}
          meta={[previewRow.raw.price ? `${previewRow.raw.price} ${previewRow.raw.currency || ''}`.trim() : null, previewRow.raw.brand]
            .filter(Boolean)
            .join(' · ')}
          body={previewRow.raw.ai_description || ''}
          isHtml={false}
          faq={(previewRow.raw.ai_faq || []).map((f: any) => ({ q: f.question || f.q, a: f.answer || f.a }))}
          onClose={() => setPreviewRow(null)}
        />
      )}
    </section>
  )
}
