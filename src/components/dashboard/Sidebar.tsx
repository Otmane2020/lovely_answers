import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useIntegrations } from '@/hooks/useIntegrations'
import { useSubscription } from '@/hooks/useSubscription'
import type { DashboardTab } from '@/views/GEODashboard'
import { HelpModal } from './HelpModal'
import {
  IconSparkle, IconHome, IconWrite, IconPin, IconChart, IconGear
} from './Icons'

interface SidebarProps {
  activeTab: DashboardTab
  onTabChange: (tab: DashboardTab) => void
}

const NAV: { id: DashboardTab; label: string; icon: JSX.Element }[] = [
  { id: 'today', label: 'Today', icon: <IconHome /> },
  { id: 'content', label: 'Content', icon: <IconWrite /> },
  { id: 'presence', label: 'Presence', icon: <IconPin /> },
  { id: 'results', label: 'Results', icon: <IconChart /> },
  { id: 'settings', label: 'Settings', icon: <IconGear /> },
]

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { data: integrations } = useIntegrations()
  const { trial, subscriptionEnd, openCustomerPortal } = useSubscription()
  const [showSupport, setShowSupport] = useState(false)

  // Only one paid tier exists today (Starter), so "Upgrade" opens the same
  // Stripe customer portal as Settings' "Manage" — it's the honest action
  // available right now, not a fabricated higher-tier flow.
  const handleUpgrade = async () => {
    try {
      await openCustomerPortal()
    } catch {
      toast.error('Could not open billing. Please try again.')
    }
  }

  // Publishing needs a CMS. Flag Settings when it isn't connected.
  const cmsConnected = (integrations || []).some(
    (i) => i.is_connected && !['google_business', 'google_search_console'].includes(i.platform)
  )
  const settingsAlerts = cmsConnected ? 0 : 1

  const handleSignOut = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <IconSparkle />
        </div>
        <div className="brand-text">
          <div className="eyebrow">AUTOPILOT</div>
          <div className="name">GEO</div>
        </div>
      </div>

      {NAV.map((item) => (
        <div
          key={item.id}
          className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
          onClick={() => onTabChange(item.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onTabChange(item.id) }}
        >
          <span className="ic">{item.icon}</span>
          <span className="label-txt">{item.label}</span>
          {item.id === 'settings' && settingsAlerts > 0 && (
            <span className="flag flag-attn">{settingsAlerts}</span>
          )}
        </div>
      ))}

      <div className="sidebar-foot">
        <div className="plan-box">
          <div className="plan-box-top">
            <span className="plan-name">Starter</span>
            {trial && <span className="plan-pill">Trial</span>}
          </div>
          {subscriptionEnd && (
            <div className="plan-meta">
              {trial ? 'Trial ends' : 'Renews'} {new Date(subscriptionEnd).toLocaleDateString()}
            </div>
          )}
          <button className="btn-upgrade" onClick={handleUpgrade}>
            Upgrade
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="signout" style={{ flex: 1 }} onClick={() => setShowSupport(true)} role="button" tabIndex={0}>
            ? Help
          </div>
          <div className="signout" style={{ flex: 1 }} onClick={handleSignOut} role="button" tabIndex={0}>
            ⇥ Sign out
          </div>
        </div>
      </div>
      {showSupport && <HelpModal onClose={() => setShowSupport(false)} />}
    </aside>
  )
}
