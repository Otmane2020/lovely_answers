interface ContentPreviewModalProps {
  kind: 'article' | 'answer'
  title: string
  meta: string
  /** HTML for articles, plain text for answers. */
  body: string
  isHtml: boolean
  bullets?: string[]
  faq?: { q: string; a: string }[]
  onClose: () => void
}

export function ContentPreviewModal({ kind, title, meta, body, isHtml, bullets, faq, onClose }: ContentPreviewModalProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,22,46,.6)', zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          maxWidth: 720, width: '100%', maxHeight: '88vh', overflowY: 'auto',
          background: 'var(--surface)', borderRadius: 16, boxShadow: '0 24px 60px rgba(20,22,46,.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            position: 'sticky', top: 0, background: 'var(--surface)', borderBottom: '1px solid var(--line)',
            padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1,
          }}
        >
          <span
            style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
              padding: '4px 10px', borderRadius: 20, background: 'var(--primary-soft)', color: 'var(--primary)',
            }}
          >
            {kind === 'article' ? 'Article preview' : 'Answer preview'}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        <article style={{ padding: '32px 40px 40px' }}>
          <h1
            style={{
              fontFamily: "'Space Grotesk', sans-serif", fontSize: kind === 'article' ? 28 : 22,
              lineHeight: 1.25, margin: '0 0 10px', color: 'var(--ink)',
            }}
          >
            {title}
          </h1>
          {meta && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 22, paddingBottom: 18, borderBottom: '1px solid var(--line)' }}>
              {meta}
            </div>
          )}

          {isHtml ? (
            <div
              className="content-preview-body"
              style={{ fontSize: 15.5, lineHeight: 1.75, color: 'var(--ink)' }}
              dangerouslySetInnerHTML={{ __html: body }}
            />
          ) : (
            <p style={{ fontSize: 15.5, lineHeight: 1.75, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{body}</p>
          )}

          {!!bullets?.length && (
            <ul style={{ marginTop: 18, paddingLeft: 20, fontSize: 14, lineHeight: 1.8, color: 'var(--ink)' }}>
              {bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}

          {!!faq?.length && (
            <div style={{ marginTop: 26 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>
                FAQ
              </div>
              {faq.map((f, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{f.q}</div>
                  <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>{f.a}</div>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </div>
  )
}
