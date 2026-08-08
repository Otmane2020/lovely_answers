import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useActiveProject } from '@/hooks/useProjects'

interface PlatformOption {
  id: string
  name: string
  /** Steps to invite support@autopilotgeo.com as a collaborator on THEIR
   * platform — never a request for their password/API key, just a staff
   * seat we can publish through. */
  steps: string[]
}

const PLATFORMS: PlatformOption[] = [
  {
    id: 'wordpress', name: 'WordPress',
    steps: [
      'In your WP admin, go to Users → Add New',
      'Email: support@autopilotgeo.com',
      'Role: Editor (or Administrator)',
      'Click "Add New User" — we\'ll take it from there',
    ],
  },
  {
    id: 'shopify', name: 'Shopify',
    steps: [
      'Go to Settings → Users and permissions → Add staff',
      'Email: support@autopilotgeo.com',
      'Grant access to Online Store / Blog posts',
      'Send the invite — we\'ll accept it and set up publishing',
    ],
  },
  {
    id: 'wix', name: 'Wix',
    steps: [
      'Go to Settings → Roles & Permissions → Invite people',
      'Email: support@autopilotgeo.com',
      'Role: Contributor (Blog access)',
      'Send the invite — we\'ll accept it and set up publishing',
    ],
  },
  {
    id: 'webflow', name: 'Webflow',
    steps: [
      'Go to Workspace settings → Members → Invite a member',
      'Email: support@autopilotgeo.com',
      'Access: Editor on this site',
      'Send the invite — we\'ll accept it and set up publishing',
    ],
  },
  {
    id: 'bigcommerce', name: 'BigCommerce',
    steps: [
      'Go to Settings → Users → Add a User',
      'Email: support@autopilotgeo.com',
      'Role: Admin or a custom Content role',
      'Save — we\'ll take it from there',
    ],
  },
  {
    id: 'framer', name: 'Framer',
    steps: [
      'Open your project → Share → Invite',
      'Email: support@autopilotgeo.com',
      'Role: Editor',
      'Send the invite — we\'ll accept it and set up publishing',
    ],
  },
  {
    id: 'other', name: 'Something else (Lovable, Bolt, Replit, custom site…)',
    steps: [
      'These builders don\'t have a staff-invite system of their own',
      'Just submit the form below — we\'ll reply by email with the simplest way to get access for your specific setup',
    ],
  },
]

interface DoItForMeModalProps {
  onClose: () => void
}

export function DoItForMeModal({ onClose }: DoItForMeModalProps) {
  const { user } = useAuth()
  const { project } = useActiveProject()
  const [platformId, setPlatformId] = useState<string>('')
  const [siteUrl, setSiteUrl] = useState(project?.website_url || '')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const platform = PLATFORMS.find((p) => p.id === platformId)

  const submit = async () => {
    if (!platformId) {
      toast.error('Pick your platform first')
      return
    }
    setSending(true)
    try {
      const brandName = project?.brand_name || project?.name || 'their project'
      const html = `
        <p><b>Do it for me</b> request from the dashboard.</p>
        <ul>
          <li><b>Account:</b> ${user?.email || 'unknown'}</li>
          <li><b>Project:</b> ${brandName}</li>
          <li><b>Platform:</b> ${platform?.name || platformId}</li>
          <li><b>Site URL:</b> ${siteUrl || project?.website_url || 'not provided'}</li>
        </ul>
        ${note ? `<p><b>Note from customer:</b><br>${note.replace(/\n/g, '<br>')}</p>` : ''}
      `
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          type: 'custom',
          to: 'support@autopilotgeo.com',
          subject: `Do it for me — ${platform?.name || platformId} setup for ${brandName}`,
          html,
        },
      })
      if (error) throw error
      setSent(true)
    } catch {
      toast.error('Could not send your request — try again or email support@autopilotgeo.com directly')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,22,46,.5)', zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 460, width: '100%', maxHeight: '86vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-head">
          <div>
            <h2>We'll set it up for you</h2>
            <p className="sub">Invite support@autopilotgeo.com as a collaborator — no password ever needed.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        {sent ? (
          <div style={{ padding: '16px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Request sent</div>
            <p className="sub" style={{ margin: 0 }}>
              Send the invite on your platform's side too (steps above) and we'll finish the setup — usually within one business day.
            </p>
          </div>
        ) : (
          <>
            <div style={{ marginTop: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>
                Platform
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 14 }}>
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlatformId(p.id)}
                    style={{
                      padding: '9px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                      border: platformId === p.id ? '1.5px solid var(--primary)' : '1px solid var(--line)',
                      background: platformId === p.id ? 'var(--primary-soft)' : 'var(--surface)',
                      color: 'var(--ink)',
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {platform && (
              <div className="card-box" style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  How to invite us on {platform.name}
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7, color: 'var(--ink-soft)' }}>
                  {platform.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            )}

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>
              Your site URL
            </label>
            <input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://yoursite.com"
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit',
                border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surface)',
                color: 'var(--ink)', marginBottom: 10, boxSizing: 'border-box',
              }}
            />

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>
              Anything we should know? (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. staging site, custom theme, who to contact…"
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit',
                border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surface)',
                color: 'var(--ink)', marginBottom: 14, boxSizing: 'border-box', resize: 'vertical',
              }}
            />

            <button className="btn btn-primary" style={{ width: '100%' }} disabled={sending} onClick={submit}>
              {sending ? 'Sending…' : 'Send request'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
