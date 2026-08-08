import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useActiveProject } from '@/hooks/useProjects'

interface SupportModalProps {
  onClose: () => void
}

const CATEGORIES = [
  'Technical issue',
  'Content generation',
  'Publishing',
  'Integration',
  'Billing / subscription',
  'Other',
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit',
  border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surface)',
  color: 'var(--ink)', marginBottom: 12, boxSizing: 'border-box',
}

export function SupportModal({ onClose }: SupportModalProps) {
  const { user } = useAuth()
  const { project } = useActiveProject()
  const [name, setName] = useState((user?.user_metadata?.full_name as string) || '')
  const [email, setEmail] = useState(user?.email || '')
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [siteUrl, setSiteUrl] = useState(project?.website_url || '')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const submit = async () => {
    if (!email.trim() || !message.trim()) {
      setStatus('error')
      setErrorMsg('Email and message are required.')
      return
    }
    setStatus('loading')
    setErrorMsg('')
    try {
      const brandName = project?.brand_name || project?.name || 'their project'
      const html = `
        <p><b>Support request</b> from the dashboard.</p>
        <ul>
          <li><b>Name:</b> ${name || 'not provided'}</li>
          <li><b>Email:</b> ${email}</li>
          <li><b>Category:</b> ${category}</li>
          <li><b>Subject:</b> ${subject || 'not provided'}</li>
          <li><b>Project:</b> ${brandName}</li>
          <li><b>Site URL:</b> ${siteUrl || 'not provided'}</li>
        </ul>
        <p><b>Message:</b><br>${message.replace(/\n/g, '<br>')}</p>
      `
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          type: 'custom',
          to: 'support@autopilotgeo.com',
          subject: `[${category}] ${subject || 'Support request'} — ${brandName}`,
          html,
        },
      })
      if (error) throw error
      setStatus('success')
    } catch {
      setStatus('error')
      setErrorMsg('Could not send your message — try emailing support@autopilotgeo.com directly.')
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
            <h2>Contact support</h2>
            <p className="sub">We reply by email, usually within a day.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        {status === 'success' ? (
          <div style={{ padding: '16px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Request sent</div>
            <p className="sub" style={{ margin: 0 }}>We'll get back to you at {email}.</p>
          </div>
        ) : (
          <>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>Name</label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>Email</label>
            <input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" />

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>Category</label>
            <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>Subject</label>
            <input style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>Site URL (optional)</label>
            <input style={inputStyle} value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://yoursite.com" />

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="What's going on? The more detail, the faster we can help."
              style={{ ...inputStyle, resize: 'vertical' }}
            />

            {status === 'error' && errorMsg && (
              <p style={{ color: 'var(--red)', fontSize: 12, marginTop: -4, marginBottom: 10 }}>{errorMsg}</p>
            )}

            <button className="btn btn-primary" style={{ width: '100%' }} disabled={status === 'loading'} onClick={submit}>
              {status === 'loading' ? 'Sending…' : 'Send request'}
            </button>
            <p className="sub" style={{ textAlign: 'center', marginTop: 10, marginBottom: 0, fontSize: 11.5 }}>
              Prefer email? support@autopilotgeo.com
            </p>
          </>
        )}
      </div>
    </div>
  )
}
