'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function handlePasswordLogin() {
    if (!email || !password) return

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart the app.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        router.push('/')
      }
    } catch (err) {
      setError('Unable to sign in. Check your network connection and Supabase settings.')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Enter your email above first, then click "Forgot password?".')
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart the app.')
      return
    }

    setResetting(true)
    setError('')

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password`,
      })
      if (error) {
        setError(error.message)
      } else {
        setResetSent(true)
      }
    } catch (err) {
      setError('Unable to send reset link. Check your network connection and Supabase settings.')
    } finally {
      setResetting(false)
    }
  }

  async function handleGoogle() {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart the app.')
      return
    }

    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback` },
      })
    } catch (err) {
      setError('Google sign-in could not be started. Check your Supabase configuration.')
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.box}>
        <div style={styles.logo}>
          <span style={styles.logoDot} />
          VAULTWAVE
        </div>
        <p style={styles.tagline}>Your media collection vault</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePasswordLogin()}
            autoFocus
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePasswordLogin()}
          />
          {error && <p style={styles.error}>{error}</p>}
          {resetSent && <p style={styles.hint}>Reset link sent to {email} — check your inbox.</p>}
          <button
            style={loading || !email || !password ? { ...styles.primary, opacity: 0.5 } : styles.primary}
            onClick={handlePasswordLogin}
            disabled={loading || !email || !password}
          >
            {loading ? 'Signing in...' : 'Sign in →'}
          </button>
          <button style={styles.forgotLink} onClick={handleForgotPassword} disabled={resetting}>
            {resetting ? 'Sending...' : 'Forgot password?'}
          </button>
        </div>

        <div style={styles.dividerRow}>
          <span style={styles.dividerLine} />
          <span style={styles.orText}>or</span>
          <span style={styles.dividerLine} />
        </div>

        <button style={styles.google} onClick={handleGoogle}>
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <p style={styles.footer}>
          VaultWave keeps your collection private by default. No ads, no tracking.
        </p>
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
  google: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 16px',
    borderRadius: 'var(--radius)',
    background: 'transparent',
    color: 'var(--text2)',
    fontFamily: 'var(--font)',
    fontSize: 13,
    border: '1px solid var(--border2)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  dividerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '20px 0',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'var(--border)',
  },
  orText: {
    fontSize: 11,
    color: 'var(--text3)',
    fontFamily: 'var(--mono)',
  },
  error: {
    fontSize: 12,
    color: 'var(--red)',
    padding: '8px 12px',
    background: 'rgba(224,85,85,0.1)',
    borderRadius: 'var(--radius)',
    border: '1px solid rgba(224,85,85,0.2)',
  },
  hint: {
    fontSize: 12,
    color: 'var(--green)',
    padding: '8px 12px',
    background: 'rgba(94,175,122,0.1)',
    borderRadius: 'var(--radius)',
    border: '1px solid rgba(94,175,122,0.2)',
  },
  forgotLink: {
    background: 'none',
    border: 'none',
    color: 'var(--text3)',
    fontSize: 12,
    cursor: 'pointer',
    padding: '2px 0',
    fontFamily: 'var(--font)',
    textAlign: 'center',
  },
  footer: {
    fontSize: 11,
    color: 'var(--text3)',
    marginTop: 24,
    lineHeight: 1.6,
    textAlign: 'center',
  },
}
