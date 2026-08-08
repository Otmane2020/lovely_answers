import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useActiveProject } from '@/hooks/useProjects'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface HelpChatModalProps {
  onClose: () => void
}

const WELCOME: ChatMessage = {
  role: 'assistant',
  content: "Hi! I'm the AutoPilot GEO assistant. Ask me anything about GEO/AEO/SEO content, connecting your site, publishing, or your plan — I'll do my best to help right here.",
}

export function HelpChatModal({ onClose }: HelpChatModalProps) {
  const { project } = useActiveProject()
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setError('')
    setInput('')
    const nextMessages = [...messages, { role: 'user' as const, content: text }]
    setMessages(nextMessages)
    setSending(true)
    try {
      const projectContext = project
        ? `Brand: ${project.brand_name || project.name}. Website: ${project.website_url || 'not set'}. Category: ${project.business_type || 'unknown'}. Language: ${project.language || 'unknown'}.`
        : undefined
      const { data, error: fnError } = await supabase.functions.invoke('help-chat', {
        body: { message: text, history: nextMessages, projectContext },
      })
      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)
      if (!data?.reply) throw new Error('No reply received')
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the assistant — try again in a moment.')
      setMessages((prev) => prev.slice(0, -1))
      setInput(text)
    } finally {
      setSending(false)
    }
  }

  const newConversation = () => {
    setMessages([WELCOME])
    setInput('')
    setError('')
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
        style={{ maxWidth: 460, width: '100%', height: 560, maxHeight: '86vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-head" style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)', marginBottom: 0 }}>
          <div>
            <h2 style={{ margin: 0 }}>AI Agent</h2>
            <p className="sub" style={{ margin: 0 }}>Instant answers about AutoPilot GEO</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={newConversation}>New chat</button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: m.role === 'user' ? 'var(--primary)' : 'var(--surface)',
                color: m.role === 'user' ? '#fff' : 'var(--ink)',
                border: m.role === 'user' ? 'none' : '1px solid var(--line)',
                borderRadius: 14,
                padding: '9px 13px',
                fontSize: 13.5,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div
              style={{
                alignSelf: 'flex-start', border: '1px solid var(--line)', borderRadius: 14,
                padding: '9px 13px', fontSize: 13, color: 'var(--ink-soft)',
              }}
            >
              Agent is typing…
            </div>
          )}
          {error && (
            <div style={{ alignSelf: 'center', fontSize: 12, color: 'var(--red)', textAlign: 'center' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask a question…"
            disabled={sending}
            style={{
              flex: 1, padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit',
              border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surface)', color: 'var(--ink)',
            }}
          />
          <button className="btn btn-primary btn-sm" disabled={sending || !input.trim()} onClick={send}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
