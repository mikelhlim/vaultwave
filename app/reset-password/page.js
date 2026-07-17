'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })

    // If the recovery token in the URL was already consumed by the time this
    // effect runs, there will already be a session — that's fine too.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })

    const timeout = setTimeout(() => {
      setReady(current => {
        if (!current) setInvalid(true)
        return current
      })
    }, 4000)

    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit() {
    if (!password || !confirm) return
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setSaving(true)
    setError('')

    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (error) {
      setError(error.message)
    } else {
      setDone(true)
      setTimeout(() => router.push('/'), 1500)
    }
  }

  if (done) {
    return (
      <div style={styles.page}>
        <div style={styles.box}>
          <div style={styles.logo}><span style={styles.logoDot} />VAULTWAVE</div>
          <p style={styles.sentTitle}>Password updated</p>
          <p style={styles.sentSub}>Taking you to your vault...</p>
        </div>
      </div>
    )
  }

  if (invalid) {
    return (
      <div style={styles.page}>
        <div style={styles.box}>
          <div style={styles.logo}><span style={styles.logoDot} />VAULTWAVE</div>
          <p style={styles.sentTitle}>This link isn't working</p>
          <p style={styles.sentSub}>
            It may have expired or already been used. Request a new reset link from the login page.
          </p>
          <button style={{ ...styles.ghost, marginTop: 16 }} onClick={() => router.push('/login')}>
            Back to login
          </button>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div style={styles.page}>
        <div style={styles.box}>
          <div style={styles.logo}><span style={styles.logoDot} />VAULTWAVE</div>
          <p style={styles.sentSub}>Verifying reset link...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.box}>
        <div style={styles.logo}><span style={styles.logoDot} />VAULTWAVE</div>
        <p style={styles.tagline}>Set a new password</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button
            style={saving || !password || !confirm ? { ...styles.primary, opacity: 0.5 } : styles.primary}
            onClick={handleSubmit}
            disabled={saving || !password || !confirm}
          >
            {saving ? 'Saving...' : 'Update password →'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
    padding: 20,
  },
  box: {
    width: '100%',
    maxWidth: 360,
    display: 'flex',
    flexDirection: 'column',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontFamily: 'var(--mono)',
    fontSize: 13,
    fontWeight: 500,
    letterSpacing: '0.16em',
    color: 'var(--text)',
  },
  logoDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--accent)',
    flexShrink: 0,
  },
  tagline: {
    fontSize: 12,
    color: 'var(--text3)',
    marginTop: 4,
    letterSpacing: '0.04em',
  },
  primary: {
    padding: '11px 16px',
    borderRadius: 'var(--radius)',
    background: 'var(--accent)',
    color: 'var(--on-brand)',
    fontFamily: 'var(--font)',
    fontWeight: 700,
    fontSize: 13,
    border: 'none',
    cursor: 'pointer',
    letterSpacing: '0.02em',
  },
  ghost: {
    padding: '10px 16px',
    borderRadius: 'var(--radius)',
    background: 'transparent',
    color: 'var(--text3)',
    fontFamily: 'var(--font)',
    fontSize: 13,
    border: '1px solid var(--border)',
    cursor: 'pointer',
    textAlign: 'center',
  },
  error: {
    fontSize: 12,
    color: 'var(--red)',
    padding: '8px 12px',
    background: 'rgba(224,85,85,0.1)',
    borderRadius: 'var(--radius)',
    border: '1px solid rgba(224,85,85,0.2)',
  },
  sentTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text)',
    marginTop: 16,
    marginBottom: 8,
  },
  sentSub: {
    fontSize: 13,
    color: 'var(--text2)',
    lineHeight: 1.6,
  },
}
