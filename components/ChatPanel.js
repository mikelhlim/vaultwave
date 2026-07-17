'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// Renders one proposed batch of changes as a reviewable card — nothing here
// touches the database. Confirm is the only path to /api/chat/apply, and
// only admins get a working Confirm button (matches Edit/Delete elsewhere).
function ProposalCard({ proposal, status, isAdmin, onConfirm, onCancel }) {
  const { summary, changes } = proposal
  return (
    <div style={s.proposalCard}>
      {summary && <p style={s.proposalSummary}>{summary}</p>}
      <div style={s.proposalList}>
        {changes.map((c, i) => (
          <div key={i} style={s.proposalItem}>
            <span style={{ ...s.proposalAction, ...(c.action === 'delete' ? s.proposalActionDelete : {}) }}>
              {c.action === 'delete' ? 'Delete' : 'Update'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={s.proposalLabel}>{c.label || c.item_id}</p>
              {c.action === 'update' && c.fields && (
                <p style={s.proposalFields}>
                  {Object.entries(c.fields).map(([k, v]) => `${k} → ${v === null || v === '' ? '(empty)' : v}`).join(' · ')}
                </p>
              )}
              {c.result && (
                <p style={{ ...s.proposalResult, color: c.result.ok ? 'var(--green)' : 'var(--red)' }}>
                  {c.result.ok ? 'Done' : (c.result.error || 'Failed')}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {status === 'pending' && (
        isAdmin ? (
          <div style={s.proposalActions}>
            <button style={s.proposalCancelBtn} onClick={onCancel}>Cancel</button>
            <button style={s.proposalConfirmBtn} onClick={onConfirm}>
              Confirm {changes.length} change{changes.length !== 1 ? 's' : ''}
            </button>
          </div>
        ) : (
          <p style={s.proposalAdminOnly}>Only an admin can confirm changes — ask one to review this.</p>
        )
      )}
      {status === 'applying' && <p style={s.proposalStatusText}>Applying...</p>}
      {status === 'confirmed' && <p style={{ ...s.proposalStatusText, color: 'var(--green)' }}>Applied.</p>}
      {status === 'cancelled' && <p style={s.proposalStatusText}>Cancelled — nothing was changed.</p>}
    </div>
  )
}

export default function ChatPanel({ isAdmin }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const bodyRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [messages, loading, error])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError(null)
    // Only plain text turns go back as history — a proposal is UI-only state,
    // not something the model needs to see replayed on the next question.
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ message: text, history }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || 'Something went wrong.')
      } else {
        const hasProposal = data.proposal?.changes?.length > 0
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.reply || (hasProposal ? '' : "I didn't get a response."),
          proposal: hasProposal ? data.proposal : null,
          proposalStatus: hasProposal ? 'pending' : null,
        }])
      }
    } catch {
      setError('Could not reach the assistant — check your connection.')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function cancelProposal(index) {
    setMessages(prev => prev.map((m, i) => (i === index ? { ...m, proposalStatus: 'cancelled' } : m)))
  }

  async function confirmProposal(index) {
    setMessages(prev => prev.map((m, i) => (i === index ? { ...m, proposalStatus: 'applying' } : m)))
    try {
      const target = messages[index]
      const res = await fetch('/api/chat/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ changes: target.proposal.changes }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setMessages(prev => prev.map((m, i) => (i === index ? { ...m, proposalStatus: 'pending' } : m)))
        setError(data.error || 'Could not apply changes.')
        return
      }
      const resultsById = new Map((data.results || []).map(r => [r.item_id, r]))
      setMessages(prev => prev.map((m, i) => {
        if (i !== index) return m
        return {
          ...m,
          proposalStatus: 'confirmed',
          proposal: {
            ...m.proposal,
            changes: m.proposal.changes.map(c => ({ ...c, result: resultsById.get(c.item_id) })),
          },
        }
      }))
    } catch {
      setMessages(prev => prev.map((m, i) => (i === index ? { ...m, proposalStatus: 'pending' } : m)))
      setError('Could not reach the server to apply changes.')
    }
  }

  return (
    <>
      <button
        style={s.fab}
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Close chat' : 'Ask about your collection'}
        title={open ? 'Close chat' : 'Ask about your collection'}
      >
        {open ? '✕' : '⋯'}
      </button>

      {open && (
        <div style={s.window}>
          <div style={s.header}>
            <div>
              <p style={s.headerTitle}>Ask VaultWave</p>
              <p style={s.headerSub}>Answers come from your actual catalog</p>
            </div>
            <button style={s.headerClose} onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
          </div>

          <div style={s.body} ref={bodyRef}>
            {messages.length === 0 && (
              <div style={s.emptyState}>
                <p style={s.emptyTitle}>Ask anything about your collection, or ask me to fix something.</p>
                <div style={s.suggestions}>
                  {[
                    'How many CDs do I own?',
                    "What's on my wishlist?",
                    'List my manga by volume',
                    'Which vinyl is in the worst condition?',
                  ].map(q => (
                    <button key={q} style={s.suggestionChip} onClick={() => setInput(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ ...s.row, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {m.content && (
                    <div style={{ ...s.bubble, ...(m.role === 'user' ? s.bubbleUser : s.bubbleAssistant) }}>
                      {m.content}
                    </div>
                  )}
                  {m.proposal && (
                    <ProposalCard
                      proposal={m.proposal}
                      status={m.proposalStatus}
                      isAdmin={isAdmin}
                      onConfirm={() => confirmProposal(i)}
                      onCancel={() => cancelProposal(i)}
                    />
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ ...s.row, justifyContent: 'flex-start' }}>
                <div style={{ ...s.bubble, ...s.bubbleAssistant, ...s.bubbleLoading }}>Thinking...</div>
              </div>
            )}
            {error && <p style={s.errorText}>{error}</p>}
          </div>

          <div style={s.inputRow}>
            <textarea
              ref={inputRef}
              style={s.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your collection..."
              rows={1}
            />
            <button style={s.sendBtn} onClick={send} disabled={loading || !input.trim()} aria-label="Send">
              →
            </button>
          </div>
        </div>
      )}
    </>
  )
}

const s = {
  fab: {
    position: 'fixed',
    right: 20,
    bottom: 20,
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'var(--bg2)',
    border: '1px solid var(--border2)',
    color: 'var(--text)',
    fontSize: 20,
    fontFamily: 'var(--font)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    zIndex: 60,
  },
  window: {
    position: 'fixed',
    right: 20,
    bottom: 80,
    width: 380,
    maxWidth: 'calc(100vw - 40px)',
    height: 520,
    maxHeight: 'calc(100vh - 120px)',
    background: 'var(--bg2)',
    border: '1px solid var(--border2)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: 60,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  headerTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  headerSub: { fontSize: 11, color: 'var(--text3)', marginTop: 2 },
  headerClose: {
    background: 'none',
    border: 'none',
    color: 'var(--text3)',
    fontSize: 14,
    cursor: 'pointer',
    padding: 2,
    lineHeight: 1,
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  emptyState: { padding: '8px 2px' },
  emptyTitle: { fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 10 },
  suggestions: { display: 'flex', flexDirection: 'column', gap: 6 },
  suggestionChip: {
    textAlign: 'left',
    padding: '8px 10px',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text2)',
    fontSize: 12,
    fontFamily: 'var(--font)',
    cursor: 'pointer',
  },
  row: { display: 'flex' },
  bubble: {
    padding: '8px 11px',
    borderRadius: 12,
    fontSize: 13,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  bubbleUser: {
    background: 'var(--highlight)',
    color: 'var(--text)',
    borderBottomRightRadius: 3,
  },
  bubbleAssistant: {
    background: 'var(--bg3)',
    color: 'var(--text2)',
    borderBottomLeftRadius: 3,
  },
  bubbleLoading: { color: 'var(--text3)', fontStyle: 'italic' },
  errorText: {
    fontSize: 12,
    color: 'var(--red)',
    padding: '6px 2px',
  },
  proposalCard: {
    background: 'var(--bg3)',
    border: '1px solid var(--border2)',
    borderRadius: 'var(--radius)',
    padding: 10,
  },
  proposalSummary: { fontSize: 12.5, color: 'var(--text)', fontWeight: 600, marginBottom: 8, lineHeight: 1.4 },
  proposalList: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 },
  proposalItem: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  proposalAction: {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text2)',
    background: 'var(--highlight)',
    padding: '2px 6px',
    borderRadius: 3,
    flexShrink: 0,
    marginTop: 1,
  },
  proposalActionDelete: { color: 'var(--red)', background: 'rgba(224,85,85,0.12)' },
  proposalLabel: { fontSize: 12.5, color: 'var(--text)', lineHeight: 1.4 },
  proposalFields: { fontSize: 11, color: 'var(--text3)', marginTop: 2, lineHeight: 1.4 },
  proposalResult: { fontSize: 11, marginTop: 2, fontFamily: 'var(--mono)' },
  proposalActions: { display: 'flex', gap: 8, marginTop: 4 },
  proposalCancelBtn: {
    flex: 1,
    padding: '7px 10px',
    background: 'transparent',
    border: '1px solid var(--border2)',
    borderRadius: 'var(--radius)',
    color: 'var(--text3)',
    fontSize: 12,
    fontFamily: 'var(--font)',
    cursor: 'pointer',
  },
  proposalConfirmBtn: {
    flex: 2,
    padding: '7px 10px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 'var(--radius)',
    color: 'var(--on-brand)',
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'var(--font)',
    cursor: 'pointer',
  },
  proposalAdminOnly: { fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.4, marginTop: 2 },
  proposalStatusText: { fontSize: 11.5, color: 'var(--text3)', marginTop: 2 },
  inputRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    resize: 'none',
    maxHeight: 90,
    fontFamily: 'var(--font)',
    fontSize: 13,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 'var(--radius)',
    border: 'none',
    background: 'var(--accent)',
    color: 'var(--on-brand)',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
}
