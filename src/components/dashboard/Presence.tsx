import { useMemo } from 'react'
import { useActiveProject } from '@/hooks/useProjects'
import { useLocalBusiness } from '@/hooks/useLocalBusiness'
import { useGoogleBusiness } from '@/hooks/useGoogleBusiness'
import type { DashboardTab } from '@/views/GEODashboard'
import { IconCheck, IconPin } from './Icons'

interface PresenceProps {
  onNavigate: (tab: DashboardTab) => void
}

function sameDomain(a?: string | null, b?: string | null) {
  if (!a || !b) return false
  const norm = (u: string) => u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase()
  return norm(a) === norm(b)
}

function stars(rating: number) {
  const full = Math.round(rating)
  return '★'.repeat(Math.max(0, Math.min(5, full))) + '☆'.repeat(Math.max(0, 5 - full))
}

export function Presence({ onNavigate }: PresenceProps) {
  const { project } = useActiveProject()
  const { business, isInitialLoading } = useLocalBusiness()
  const { isConnected, connectGMB } = useGoogleBusiness()

  const checks = useMemo(() => {
    if (!business) return []
    return [
      {
        ok: !!business.name,
        label: business.name ? `Listed as “${business.name}”` : 'No business name on the listing',
      },
      {
        ok: !!business.address,
        label: business.address ? 'Address present on the listing' : 'Address missing from the listing',
      },
      {
        ok: !!business.phone,
        label: business.phone ? 'Phone number present' : 'No phone number on the listing',
      },
      {
        ok: sameDomain(business.website, project?.website_url),
        label: sameDomain(business.website, project?.website_url)
          ? 'Listing website matches your site'
          : `Listing website ${business.website ? `(${business.website})` : 'is missing'} doesn't match ${project?.website_url || 'your site'}`,
      },
      {
        ok: !!(business.openingHours && business.openingHours.length),
        label: business.openingHours?.length ? 'Opening hours published' : 'No opening hours on the listing',
      },
    ]
  }, [business, project])

  const issues = checks.filter((c) => !c.ok)
  const reviews = business?.reviews || []

  if (isInitialLoading) {
    return (
      <section>
        <div className="top-header">
          <h1>Presence</h1>
          <p>Loading your business listing…</p>
        </div>
      </section>
    )
  }

  // No listing linked yet — this is the real state for most new accounts.
  if (!business) {
    return (
      <section>
        <div className="top-header">
          <h1>Presence</h1>
          <p>Checked automatically every week — this isn't content, it's upkeep</p>
        </div>
        <div className="card empty">
          <div className="icon-tile indigo" style={{ width: '52px', height: '52px', margin: '0 auto 14px' }}>
            <IconPin />
          </div>
          <h3>No business listing linked</h3>
          <p>
            Link your Google Business Profile and we'll check your name, address, phone, hours and
            reviews for consistency every week.
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            {!isConnected && (
              <button className="btn btn-primary btn-sm" onClick={() => connectGMB()}>
                Connect Google Business
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('settings')}>
              Go to Settings
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="top-header">
        <h1>Presence</h1>
        <p>Checked automatically every week — this isn't content, it's upkeep</p>
      </div>

      <div className="presence-grid">
        <div className="card">
          <h2>Business listing</h2>
          <p className="sub">Consistency of your information</p>
          {checks.map((c, i) => (
            <div className="check-row" key={i}>
              <span className={`check-ic ${c.ok ? 'ok' : 'warn'}`}>{c.ok ? '✓' : '!'}</span>
              <span>{c.label}</span>
            </div>
          ))}
          {issues.length > 0 && (
            <button className="btn btn-primary btn-sm" style={{ marginTop: '14px' }} onClick={() => onNavigate('settings')}>
              Fix {issues.length} issue{issues.length > 1 ? 's' : ''}
            </button>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Recent reviews</h2>
              <p className="sub">
                {business.rating ? `${business.rating} ★ from ${business.reviewCount || 0} reviews` : 'No rating yet'}
              </p>
            </div>
          </div>
          {reviews.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--ink-soft)', margin: 0 }}>
              No reviews pulled in yet.
            </p>
          ) : (
            reviews.slice(0, 4).map((r, i) => (
              <div className="review" key={i}>
                <div className="review-top">
                  <span>Review {i + 1}</span>
                  <span className="stars">{stars(r.rating)}</span>
                </div>
                <p>{r.text}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {issues.length === 0 && (
        <>
          <div className="section-label">Status</div>
          <div className="card empty">
            <div className="icon-tile green" style={{ width: '52px', height: '52px', margin: '0 auto 14px' }}>
              <IconCheck />
            </div>
            <h3>All clear</h3>
            <p>Your listing is consistent everywhere. We'll flag anything that needs you here.</p>
          </div>
        </>
      )}
    </section>
  )
}
