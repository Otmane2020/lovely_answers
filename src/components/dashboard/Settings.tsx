import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useActiveProject, useUpdateProject } from '@/hooks/useProjects'
import { useIntegrations } from '@/hooks/useIntegrations'
import { useSubscription } from '@/hooks/useSubscription'
import { useGoogleBusiness } from '@/hooks/useGoogleBusiness'
import { ConnectPanel } from './ConnectPanel'
import { IconGlobe, IconCart, IconUser, IconCard } from './Icons'

import googleSearchConsoleLogo from '@/assets/google-search-console-logo.svg'
import googleBusinessLogo from '@/assets/google-business-logo.svg'

const CMS_PLATFORMS = ['wordpress', 'shopify', 'webflow', 'wix', 'bigcommerce', 'framer', 'lovable', 'bolt', 'replit', 'api', 'webhook']

const PLATFORM_LABEL: Record<string, string> = {
  wordpress: 'WordPress', shopify: 'Shopify', webflow: 'Webflow', wix: 'Wix',
  bigcommerce: 'BigCommerce', framer: 'Framer', lovable: 'Lovable', bolt: 'Bolt', replit: 'Replit',
  api: 'API', webhook: 'Webhook',
  google_business: 'Google Business Profile', google_search_console: 'Google Search Console',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: '13.5px', fontFamily: 'inherit',
  border: '1px solid var(--line)', borderRadius: '9px', background: 'var(--surface)',
  color: 'var(--ink)', marginBottom: '8px', boxSizing: 'border-box',
}

export function Settings() {
  const { user } = useAuth()
  const { project } = useActiveProject()
  const { data: integrations = [], isLoading, refetch: refetchIntegrations } = useIntegrations()
  const updateProject = useUpdateProject()
  // GEODashboard gates access on subscription status, so anyone reaching
  // Settings is already paying — there's no free tier to "upgrade" from here.
  const {
    subscribed, trial, subscriptionEnd, creditsTotal,
    isLoading: subLoading, openCustomerPortal,
  } = useSubscription()
  const { isConnected: gmbConnected, connectGMB } = useGoogleBusiness()

  const [showConnect, setShowConnect] = useState(false)
  const [editProject, setEditProject] = useState(false)
  const [editAccount, setEditAccount] = useState(false)
  const [saving, setSaving] = useState(false)
  const [connectingGsc, setConnectingGsc] = useState(false)

  const [brandName, setBrandName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [fullName, setFullName] = useState('')

  const cms = integrations.find((i) => CMS_PLATFORMS.includes(i.platform) && i.is_connected)
  const catalog = integrations.find((i) => ['shopify', 'bigcommerce'].includes(i.platform) && i.is_connected)
  const gscConnected = integrations.some((i) => i.platform === 'google_search_console' && i.is_connected)

  const planLabel = subLoading
    ? 'Checking…'
    : trial
    ? 'Free trial — active'
    : subscribed
    ? 'Active subscription'
    : 'Subscription inactive'

  const planMeta = subLoading
    ? ''
    : subscriptionEnd
    ? `${trial ? 'Trial ends' : 'Renews'} ${new Date(subscriptionEnd).toLocaleDateString()}${
        creditsTotal ? ` · ${creditsTotal} credits` : ''
      }`
    : 'Contact support if this looks wrong'

  const handleBilling = async () => {
    try {
      await openCustomerPortal()
    } catch {
      toast.error('Could not open billing. Please try again.')
    }
  }

  // Real OAuth flow, ported from the legacy Integrations page rather than
  // rebuilt: get the Google consent URL, remember where to return, redirect.
  const connectGSC = async () => {
    setConnectingGsc(true)
    try {
      const redirectUri = `${window.location.origin}/geo?tab=settings`
      sessionStorage.setItem('gsc_oauth_redirect_uri', redirectUri)
      const { data, error } = await supabase.functions.invoke('google-oauth-url', {
        body: { redirectUri },
      })
      if (error) throw error
      if (!data?.url) throw new Error('Failed to get OAuth URL')
      window.location.href = data.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to connect to Google Search Console')
      setConnectingGsc(false)
    }
  }

  // Completes the round trip above: Google redirects back here with a code.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')
    const state = new URLSearchParams(window.location.search).get('state')
    if (!code || !state) return

    const exchange = async () => {
      setConnectingGsc(true)
      try {
        const redirectUri = sessionStorage.getItem('gsc_oauth_redirect_uri') || `${window.location.origin}/geo?tab=settings`
        const { data, error } = await supabase.functions.invoke('google-oauth-token', {
          body: { code, state, redirectUri },
        })
        if (error) throw error
        if (!data?.success) throw new Error([data?.error, data?.details].filter(Boolean).join('\n') || 'Failed to connect')
        toast.success('Google Search Console connected')
        refetchIntegrations()
        sessionStorage.removeItem('gsc_oauth_redirect_uri')
        window.history.replaceState({}, document.title, window.location.pathname + '?tab=settings')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to connect Google Search Console')
      } finally {
        setConnectingGsc(false)
      }
    }
    exchange()
  }, [refetchIntegrations])

  const openProjectEdit = () => {
    setBrandName(project?.brand_name || project?.name || '')
    setWebsiteUrl(project?.website_url || '')
    setEditProject(true)
  }

  const saveProject = async () => {
    if (!project) return
    setSaving(true)
    try {
      await updateProject.mutateAsync({
        projectId: project.id,
        updates: { brand_name: brandName, website_url: websiteUrl },
      })
      toast.success('Project updated')
      setEditProject(false)
    } catch {
      toast.error('Could not save your project')
    } finally {
      setSaving(false)
    }
  }

  const openAccountEdit = () => {
    setFullName((user?.user_metadata?.full_name as string) || '')
    setEditAccount(true)
  }

  const saveAccount = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } })
      if (error) throw error
      toast.success('Account updated')
      setEditAccount(false)
    } catch {
      toast.error('Could not save your account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <div className="top-header">
        <h1>Settings</h1>
        <p>Connections, access and billing</p>
      </div>

      {showConnect && <ConnectPanel onClose={() => setShowConnect(false)} />}

      <div className="section-label">Connections</div>
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="setting-row">
          <div className="setting-l">
            <div className="setting-ic icon-tile indigo"><IconGlobe /></div>
            <div>
              <div className="setting-name">Website (CMS)</div>
              <div className="setting-meta">
                {isLoading
                  ? 'Checking…'
                  : cms
                  ? `${PLATFORM_LABEL[cms.platform] || cms.platform} — publishing enabled`
                  : 'Required to publish automatically'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {cms ? <span className="badge-connected">Connected</span> : <span className="badge-missing">Not connected</span>}
            <button className={cms ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'} onClick={() => setShowConnect(true)}>
              {cms ? 'Manage' : 'Connect'}
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-l">
            <div className="setting-ic icon-tile indigo" style={{ padding: 8 }}>
              <img src={googleBusinessLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <div className="setting-name">Google Business Profile</div>
              <div className="setting-meta">Business listing and reviews</div>
            </div>
          </div>
          {gmbConnected ? (
            <span className="badge-connected">Connected</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="badge-missing">Not connected</span>
              <button className="btn btn-primary btn-sm" onClick={() => connectGMB()}>Connect</button>
            </div>
          )}
        </div>

        <div className="setting-row">
          <div className="setting-l">
            <div className="setting-ic icon-tile indigo"><IconCart /></div>
            <div>
              <div className="setting-name">Product catalog</div>
              <div className="setting-meta">
                {catalog ? `${PLATFORM_LABEL[catalog.platform] || catalog.platform} — synced` : 'Optional — for product pages'}
              </div>
            </div>
          </div>
          {catalog ? (
            <span className="badge-connected">Connected</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="badge-missing">Not connected</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowConnect(true)}>Connect</button>
            </div>
          )}
        </div>

        <div className="setting-row">
          <div className="setting-l">
            <div className="setting-ic icon-tile indigo" style={{ padding: 8 }}>
              <img src={googleSearchConsoleLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <div className="setting-name">Google Search Console</div>
              <div className="setting-meta">Indexing status and search performance</div>
            </div>
          </div>
          {gscConnected ? (
            <span className="badge-connected">Connected</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="badge-missing">Not connected</span>
              <button className="btn btn-primary btn-sm" disabled={connectingGsc} onClick={connectGSC}>
                {connectingGsc ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="section-label">Project</div>
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="setting-row">
          <div className="setting-l" style={{ flex: 1, minWidth: 0 }}>
            <div className="setting-ic icon-tile indigo"><IconGlobe /></div>
            {editProject ? (
              <div style={{ flex: 1, minWidth: 0 }}>
                <input style={inputStyle} value={brandName} placeholder="Brand name"
                  onChange={(e) => setBrandName(e.target.value)} />
                <input style={{ ...inputStyle, marginBottom: 0 }} value={websiteUrl} placeholder="https://yoursite.com"
                  onChange={(e) => setWebsiteUrl(e.target.value)} />
              </div>
            ) : (
              <div>
                <div className="setting-name">{project?.brand_name || project?.name || 'Your project'}</div>
                <div className="setting-meta">{project?.website_url || 'No website set'}</div>
              </div>
            )}
          </div>
          {editProject ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditProject(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={saveProject}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={openProjectEdit}>Edit</button>
          )}
        </div>
      </div>

      <div className="section-label">Account</div>
      <div className="card">
        <div className="setting-row">
          <div className="setting-l" style={{ flex: 1, minWidth: 0 }}>
            <div className="setting-ic icon-tile indigo"><IconUser /></div>
            {editAccount ? (
              <div style={{ flex: 1, minWidth: 0 }}>
                <input style={{ ...inputStyle, marginBottom: 0 }} value={fullName} placeholder="Your name"
                  onChange={(e) => setFullName(e.target.value)} />
              </div>
            ) : (
              <div>
                <div className="setting-name">
                  {(user?.user_metadata?.full_name as string) || user?.email?.split('@')[0] || 'Your account'}
                </div>
                <div className="setting-meta">{user?.email}</div>
              </div>
            )}
          </div>
          {editAccount ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditAccount(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={saveAccount}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={openAccountEdit}>Edit</button>
          )}
        </div>

        <div className="setting-row">
          <div className="setting-l">
            <div className="setting-ic icon-tile indigo"><IconCard /></div>
            <div>
              <div className="setting-name">{planLabel}</div>
              <div className="setting-meta">{planMeta}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" disabled={subLoading} onClick={handleBilling}>
            Manage
          </button>
        </div>
      </div>
    </section>
  )
}
