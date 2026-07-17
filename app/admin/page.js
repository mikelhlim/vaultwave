'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { MEDIA_TYPES } from '@/lib/constants'

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState(null)
  const [danger, setDanger] = useState(null)

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    if (res.ok) setUsers(await res.json())
    setUsersLoading(false)
  }, [])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/'); return }
      setAuthorized(true)
      setLoading(false)
      fetchUsers()
    })()
  }, [fetchUsers, router])

  async function createUser(e) {
    e.preventDefault()
    if (!newEmail) return
    setCreating(true)
    setMessage(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ email: newEmail }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMessage({ type: 'error', text: data.error || 'Failed to create user' })
    } else {
      setMessage({ type: 'success', text: `Created ${data.email} — default password: 123456` })
      setNewEmail('')
      fetchUsers()
    }
    setCreating(false)
  }

  async function deleteAll(scope) {
    const labels = { all: 'ALL media', music: 'all Music (vinyl + CDs)', manga: 'all Manga (comics + manga)' }
    if (!confirm(`Delete ${labels[scope]}? This cannot be undone.`)) return

    setDanger(scope)
    setMessage(null)
    let query = supabase.from('items').delete()
    if (scope === 'music') query = query.in('type', ['vinyl', 'cd'])
    else if (scope === 'manga') query = query.in('type', ['comic', 'manga'])
    else query = query.in('type', MEDIA_TYPES)

    const { error } = await query
    setDanger(null)
    setMessage(error
      ? { type: 'error', text: error.message }
      : { type: 'success', text: `Deleted ${labels[scope]}.` })
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>
        LOADING...
      </div>
    )
  }
  if (!authorized) return null

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <div style={s.pageHead}>
          <button style={s.backBtn} onClick={() => router.push('/')}>← Back</button>
          <h1 style={s.pageTitle}>Admin</h1>
        </div>

        {message && (
          <div style={{ ...s.message, ...(message.type === 'error' ? s.messageError : s.messageSuccess) }}>
            {message.text}
          </div>
        )}

        {/* Create user */}
        <section style={s.section}>
          <h2 style={s.sectionTitle}>Create User</h2>
          <p style={s.sectionSub}>
            New accounts get view-only access to the catalog with the default password{' '}
            <code style={s.code}>123456</code>.
          </p>
          <form onSubmit={createUser} style={s.form}>
            <input
              type="email"
              placeholder="user@email.com"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              required
            />
            <button className="btn btn-primary" type="submit" disabled={creating} style={s.createBtn}>
              {creating ? 'Creating...' : 'Create User'}
            </button>
          </form>

          <div style={s.userList}>
            {usersLoading ? (
              <p style={s.dim}>Loading users...</p>
            ) : users.length === 0 ? (
              <p style={s.dim}>No users yet.</p>
            ) : (
              users.map(u => (
                <div key={u.id} style={s.userRow}>
                  <span style={s.userEmail}>{u.email}</span>
                  <span style={{ ...s.roleBadge, ...(u.role === 'admin' ? s.roleAdmin : s.roleViewer) }}>
                    {u.role}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Danger zone */}
        <section style={s.section}>
          <h2 style={{ ...s.sectionTitle, color: 'var(--red)' }}>Danger Zone</h2>
          <p style={s.sectionSub}>These permanently delete items from the catalog. This cannot be undone.</p>
          <div style={s.dangerRow}>
            <button style={s.dangerBtn} onClick={() => deleteAll('all')} disabled={!!danger}>
              {danger === 'all' ? 'Deleting...' : 'Delete All Media'}
            </button>
            <button style={s.dangerBtn} onClick={() => deleteAll('music')} disabled={!!danger}>
              {danger === 'music' ? 'Deleting...' : 'Delete All Music'}
            </button>
            <button style={s.dangerBtn} onClick={() => deleteAll('manga')} disabled={!!danger}>
              {danger === 'manga' ? 'Deleting...' : 'Delete All Manga'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: 'var(--bg)', padding: '40px 20px' },
  inner: { maxWidth: 560, margin: '0 auto' },
  pageHead: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 },
  backBtn: {
    background: 'none', border: 'none', color: 'var(--text3)',
    fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: 'var(--font)',
  },
  pageTitle: { fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' },

  message: {
    padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13,
    marginBottom: 20, lineHeight: 1.5,
  },
  messageSuccess: {
    background: 'rgba(94,175,122,0.1)', color: 'var(--green)',
    border: '1px solid rgba(94,175,122,0.2)',
  },
  messageError: {
    background: 'rgba(224,85,85,0.1)', color: 'var(--red)',
    border: '1px solid rgba(224,85,85,0.2)',
  },

  section: {
    marginBottom: 32, padding: 20, background: 'var(--bg2)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
  },
  sectionTitle: { fontSize: 15, fontWeight: 700, marginBottom: 6 },
  sectionSub: { fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 16 },
  code: {
    fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)',
    background: 'var(--highlight)', padding: '1px 6px', borderRadius: 4,
  },

  form: { display: 'flex', gap: 8, marginBottom: 16 },
  createBtn: { flexShrink: 0 },

  userList: { display: 'flex', flexDirection: 'column', gap: 0, borderTop: '1px solid var(--border)' },
  dim: { fontSize: 12, color: 'var(--text3)', padding: '10px 0' },
  userRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 0', borderBottom: '1px solid var(--border)',
  },
  userEmail: { fontSize: 13, color: 'var(--text)' },
  roleBadge: {
    fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.08em',
    padding: '2px 7px', borderRadius: 3, textTransform: 'uppercase',
  },
  roleAdmin: { color: 'var(--text2)', background: 'var(--highlight)' },
  roleViewer: { color: 'var(--text3)', background: 'var(--bg3)' },

  dangerRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  dangerBtn: {
    flex: '1 1 150px', padding: '10px 12px', borderRadius: 'var(--radius)',
    border: '1px solid rgba(224,85,85,0.3)', background: 'rgba(224,85,85,0.08)',
    color: 'var(--red)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font)', transition: 'all 0.15s',
  },
}
