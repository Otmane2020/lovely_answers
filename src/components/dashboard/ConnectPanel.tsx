import { useState } from 'react'
import { useActiveProject } from '@/hooks/useProjects'
import { useIntegrations, useDeleteIntegration } from '@/hooks/useIntegrations'
import { IntegrationConfigModal } from '@/components/integrations/IntegrationConfigModal'
import { DoItForMeModal } from './DoItForMeModal'
import { useImportFeed, useShoppingProducts } from '@/hooks/useShoppingProducts'
import { toast } from 'sonner'

import shopifyLogo from '@/assets/shopify-logo-new.png'
import wordpressLogo from '@/assets/wordpress-logo-new.png'
import bigcommerceLogo from '@/assets/bigcommerce-logo.png'
import framerLogo from '@/assets/framer-logo.png'
import wixLogo from '@/assets/wix-logo.png'
import webflowLogo from '@/assets/webflow-logo.svg'
import boltLogo from '@/assets/bolt-new-logo.svg'
import lovableLogo from '@/assets/lovable-logo.svg'
import replitLogo from '@/assets/replit-logo.svg'

/** Platforms we can publish to. Same ids the edge functions expect.
 * Google Search Console lives in Settings' Connections card instead — it's
 * an OAuth account link, not a CMS config form like these, and
 * IntegrationConfigModal (used below) has no config for it at all.
 * Bolt/Lovable/Replit publish through a webhook or API endpoint the same
 * way "API"/"Webhook" do — these AI site builders don't have their own
 * publish API, so IntegrationConfigModal's config for them just collects
 * that endpoint under their own branding instead of the generic one. */
const PLATFORMS = [
  { id: 'wordpress', name: 'WordPress', icon: wordpressLogo, isImage: true },
  { id: 'shopify', name: 'Shopify', icon: shopifyLogo, isImage: true },
  { id: 'wix', name: 'Wix', icon: wixLogo, isImage: true },
  { id: 'framer', name: 'Framer', icon: framerLogo, isImage: true },
  { id: 'bigcommerce', name: 'BigCommerce', icon: bigcommerceLogo, isImage: true },
  { id: 'webflow', name: 'Webflow', icon: webflowLogo, isImage: true },
  { id: 'lovable', name: 'Lovable', icon: lovableLogo, isImage: true },
  { id: 'bolt', name: 'Bolt', icon: boltLogo, isImage: true },
  { id: 'replit', name: 'Replit', icon: replitLogo, isImage: true },
  { id: 'api', name: 'API', icon: '⚙️', isImage: false },
  { id: 'webhook', name: 'Webhook', icon: '🔗', isImage: false },
] as const

// Maps what internal-scraper's detectCMS() actually returns onto our
// platform ids. WooCommerce/WordPress both land on 'wordpress' — same
// Application Passwords auth works for either.
const DETECTED_CMS_MAP: Record<string, string> = {
  woocommerce: 'wordpress', wordpress: 'wordpress', shopify: 'shopify', wix: 'wix',
  webflow: 'webflow', framer: 'framer', bigcommerce: 'bigcommerce',
  lovable: 'lovable', replit: 'replit',
}

interface ConnectPanelProps {
  onClose: () => void
}

/**
 * Picking and configuring a CMS, inside the dashboard. Opens the existing
 * IntegrationConfigModal rather than sending people to the legacy page.
 */
export function ConnectPanel({ onClose }: ConnectPanelProps) {
  const { project } = useActiveProject()
  const { data: integrations = [], refetch } = useIntegrations()
  const deleteIntegration = useDeleteIntegration()
  const [platform, setPlatform] = useState<string | null>(null)
  const [showDoItForMe, setShowDoItForMe] = useState(false)
  // Reuses the existing feed pipeline (parse-shopping-feed -> shopping_products),
  // previously only reachable from the standalone Shopping dashboard.
  const importFeed = useImportFeed()
  const { data: shoppingProducts = [] } = useShoppingProducts()
  const [feedUrl, setFeedUrl] = useState('')

  const importShoppingFeed = async () => {
    if (!feedUrl.trim()) {
      toast.error('Paste your Google Shopping feed URL first')
      return
    }
    try {
      const result: any = await importFeed.mutateAsync({ feedUrl: feedUrl.trim() })
      toast.success(`${result?.imported ?? 0} products imported`)
      setFeedUrl('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not import that feed')
    }
  }

  const connectedFor = (id: string) => integrations.find((i) => i.platform === id && i.is_connected)
  const current = platform ? connectedFor(platform) : undefined
  const detectedCms = (project as { detected_cms?: string } | undefined)?.detected_cms
  const detectedPlatformId = detectedCms ? DETECTED_CMS_MAP[detectedCms.toLowerCase()] : undefined

  const disconnect = async (integrationId: string, name: string) => {
    try {
      await deleteIntegration.mutateAsync(integrationId)
      toast.success(`${name} disconnected`)
      refetch()
    } catch {
      toast.error(`Could not disconnect ${name}`)
    }
  }

  return (
    <div className="card" style={{ marginBottom: '20px' }}>
      <div className="card-head">
        <div>
          <h2>Connect your website</h2>
          <p className="sub">Pick where your content should publish. Nothing goes live until one is linked.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Done</button>
      </div>

      <button
        onClick={() => setShowDoItForMe(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
          padding: '10px 12px', marginTop: 4, marginBottom: 4, borderRadius: 10,
          border: '1px dashed var(--line)', background: 'var(--primary-soft)',
          color: 'var(--primary)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Prefer we set it up for you? Get help connecting →
      </button>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '10px',
          marginTop: '4px',
        }}
      >
        {PLATFORMS.map((p) => {
          const connected = connectedFor(p.id)
          return (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 14px',
                borderRadius: '12px', cursor: 'pointer', textAlign: 'left', width: '100%',
                fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 600,
                border: connected ? '1.5px solid var(--green)' : '1px solid var(--line)',
                background: connected ? 'var(--green-soft)' : 'var(--surface)',
                color: 'var(--ink)',
              }}
            >
              {p.isImage ? (
                <img src={p.icon as unknown as string} alt="" style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0 }} />
              ) : (
                <span style={{ fontSize: 19, flexShrink: 0 }}>{p.icon as string}</span>
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                {p.name}
                {connected ? (
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--green)' }}>
                    Connected
                  </span>
                ) : detectedPlatformId === p.id ? (
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--primary)' }}>
                    Detected on your site
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>

      {integrations.filter((i) => i.is_connected).length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: '22px' }}>Connected</div>
          {integrations
            .filter((i) => i.is_connected)
            .map((i) => (
              <div className="setting-row" key={i.id}>
                <div className="setting-l">
                  <div>
                    <div className="setting-name">
                      {PLATFORMS.find((p) => p.id === i.platform)?.name || i.platform}
                    </div>
                    <div className="setting-meta">{i.config?.url || i.config?.name || 'Publishing enabled'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPlatform(i.platform)}>Edit</button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--red)', borderColor: '#f1cccc' }}
                    onClick={() => disconnect(i.id, i.platform)}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
        </>
      )}

      <div className="section-label" style={{ marginTop: '22px' }}>Google Shopping feed</div>
      <div className="card-box">
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 10 }}>
          {shoppingProducts.length > 0
            ? `${shoppingProducts.length} product${shoppingProducts.length > 1 ? 's' : ''} imported — Shopping content is generated from your real catalog.`
            : 'Paste your Google Merchant / Shopping feed URL to import your catalog. Without it, Shopping days fall back to a general buying guide.'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://yoursite.com/feed.xml"
            style={{
              flex: 1, padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit',
              border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surface)', color: 'var(--ink)',
            }}
          />
          <button className="btn btn-primary btn-sm" disabled={importFeed.isPending} onClick={importShoppingFeed}>
            {importFeed.isPending ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>

      {showDoItForMe && <DoItForMeModal onClose={() => setShowDoItForMe(false)} />}

      {project && (
        <IntegrationConfigModal
          open={!!platform}
          onOpenChange={(open) => !open && setPlatform(null)}
          platform={platform}
          projectId={project.id}
          existingConfig={current?.config}
          integrationId={current?.id}
          onSuccess={() => {
            setPlatform(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}
