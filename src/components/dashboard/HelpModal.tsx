import { useState } from 'react'
import { SupportModal } from './SupportModal'
import { HelpChatModal } from './HelpChatModal'

interface HelpModalProps {
  onClose: () => void
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Why is nothing published on my site yet?',
    a: "Content generates automatically from day one, but nothing goes live until your CMS is connected in Settings → Connect. Once it's linked, the backlog starts publishing.",
  },
  {
    q: "What's the difference between GEO, AEO, SEO, Local AEO and Shopping content?",
    a: 'Each is a different format: GEO is long, citation-ready content for AI engines. AEO is short direct Q&A. SEO is a classic structured long-form article for Google. Local AEO answers location-specific questions (needs Google Business connected). Shopping enriches your product catalog (needs products added).',
  },
  {
    q: "I don't want to connect my CMS myself — can you do it?",
    a: 'Yes — use "Do it for me" in Settings → Connect. You invite support@autopilotgeo.com as a collaborator on your platform, no password ever needed, and we finish the setup.',
  },
  {
    q: 'How do I change or cancel my plan?',
    a: 'Settings → Manage (or the Upgrade button in the sidebar) opens Stripe billing, where you can change plans, update payment details, or cancel — takes effect immediately.',
  },
]

export function HelpModal({ onClose }: HelpModalProps) {
  const [showChat, setShowChat] = useState(false)
  const [showSupport, setShowSupport] = useState(false)

  if (showChat) return <HelpChatModal onClose={() => setShowChat(false)} />
  if (showSupport) return <SupportModal onClose={() => setShowSupport(false)} />

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
            <h2>Need help?</h2>
            <p className="sub">Get an instant answer, or reach the team directly.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', padding: '14px 16px', height: 'auto' }}
            onClick={() => setShowChat(true)}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Talk with the AI agent</div>
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.85 }}>Get an answer immediately</div>
            </div>
          </button>
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', padding: '14px 16px', height: 'auto', border: '1px solid var(--line)' }}
            onClick={() => setShowSupport(true)}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Contact support</div>
              <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-soft)' }}>Send us your request by email</div>
            </div>
          </button>
        </div>

        <div className="section-label">FAQ</div>
        {FAQ.map((item, i) => (
          <details key={i} className="card-box" style={{ marginBottom: 8, cursor: 'pointer' }}>
            <summary style={{ fontSize: 13, fontWeight: 600 }}>{item.q}</summary>
            <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.6, marginTop: 8, marginBottom: 0 }}>
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </div>
  )
}
