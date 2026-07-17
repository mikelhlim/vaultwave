'use client'
import { Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TYPE_COLORS } from '@/lib/constants'
import ChatPanel from './ChatPanel'

const NAV_ITEMS = [
  { label: 'All Media',   type: 'all',   icon: '▦' },
  { label: 'Vinyl',       type: 'vinyl', icon: '⦿' },
  { label: 'CDs',         type: 'cd',    icon: '◎' },
  { label: 'Comics',      type: 'comic', icon: '▣' },
  { label: 'Manga',       type: 'manga', icon: '◈' },
]

function SidebarInner({ user, counts = {}, role }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isAdmin = role === 'admin'

  const onDashboard = pathname === '/'
  const onCollection = pathname === '/collection'
  const activeType = onCollection ? (searchParams.get('view') || searchParams.get('type') || 'all') : null

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Mutually-exclusive type counts only — wishlist/lent aren't exclusive
  // with a type, so summing them in here would double-count "All Media".
  const total = (counts.vinyl || 0) + (counts.cd || 0) + (counts.comic || 0) + (counts.manga || 0)

  return (
    <aside style={s.sidebar}>
      <a href="/" style={s.logoWrap}>
        <div style={s.logo}>
          <span style={s.logoDot} />
          VAULTWAVE
        </div>
        <div style={s.logoSub}>Media Collection</div>
      </a>

      <nav style={s.nav}>
        <a href="/" style={{ ...s.navItem, ...(onDashboard ? s.navItemActive : {}) }}>
          <span style={{ ...s.navIcon, color: onDashboard ? 'var(--text)' : 'var(--text3)' }}>⌂</span>
          <span style={s.navLabel}>Dashboard</span>
        </a>

        <div style={{ ...s.navSection, marginTop: 10 }}>Library</div>
        {NAV_ITEMS.map(({ label, type, icon }) => {
          const count = type === 'all' ? total : (counts[type] || 0)
          const active = activeType === type
          const href = type === 'all' ? '/collection' : `/collection?type=${type}`
          return (
            <a
              key={type}
              href={href}
              style={{ ...s.navItem, ...(active ? s.navItemActive : {}) }}
            >
              <span style={{
                ...s.navIcon,
                color: active
                  ? (type === 'all' ? 'var(--text)' : TYPE_COLORS[type])
                  : 'var(--text3)',
              }}>
                {icon}
              </span>
              <span style={s.navLabel}>{label}</span>
              {count > 0 && (
                <span style={s.navCount}>{count}</span>
              )}
            </a>
          )
        })}

        <div style={{ ...s.navSection, marginTop: 16 }}>Collections</div>
        <a href="/collection?view=wishlist" style={{ ...s.navItem, ...(activeType === 'wishlist' ? s.navItemActive : {}) }}>
          <span style={{ ...s.navIcon, color: 'var(--text3)' }}>♡</span>
          <span style={s.navLabel}>Wishlist</span>
          {counts.wishlist > 0 && <span style={s.navCount}>{counts.wishlist}</span>}
        </a>
        <a href="/collection?view=lent" style={{ ...s.navItem, ...(activeType === 'lent' ? s.navItemActive : {}) }}>
          <span style={{ ...s.navIcon, color: 'var(--text3)' }}>↗</span>
          <span style={s.navLabel}>Lent Out</span>
          {counts.lent > 0 && <span style={s.navCount}>{counts.lent}</span>}
        </a>
      </nav>

      <div style={s.bottom}>
        {isAdmin && <a href="/add" style={s.addBtn}>+ Add Item</a>}
        {isAdmin && <a href="/admin" style={s.adminBtn}>⚙ Admin</a>}
        <div style={s.userRow}>
          <span style={s.userEmail}>{user?.email}</span>
          <a href="/reset-password" style={s.changePwBtn}>password</a>
          <button style={s.logoutBtn} onClick={logout}>out</button>
        </div>
      </div>
    </aside>
  )
}

export default function Sidebar(props) {
  return (
    <>
      <Suspense fallback={<aside style={s.sidebar} />}>
        <SidebarInner {...props} />
      </Suspense>
      <ChatPanel isAdmin={props.role === 'admin'} />
    </>
  )
}

const s = {
  sidebar: {
    width: 220,
    minWidth: 220,
    background: 'var(--bg2)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
  },
  logoWrap: {
    display: 'block',
    padding: '20px 18px 16px',
    borderBottom: '1px solid var(--border)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontFamily: 'var(--mono)',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text)',
    letterSpacing: '0.14em',
  },
  logoDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--accent)',
    flexShrink: 0,
  },
  logoSub: {
    fontSize: 10,
    color: 'var(--text3)',
    letterSpacing: '0.1em',
    marginTop: 3,
    textTransform: 'uppercase',
  },
  nav: {
    flex: 1,
    padding: '10px 0',
    overflowY: 'auto',
  },
  navSection: {
    padding: '6px 18px 4px',
    fontSize: 9,
    fontFamily: 'var(--mono)',
    color: 'var(--text3)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    padding: '8px 18px',
    background: 'transparent',
    border: 'none',
    borderLeftWidth: 2,
    borderLeftStyle: 'solid',
    borderLeftColor: 'transparent',
    color: 'var(--text2)',
    fontSize: 13,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  navItemActive: {
    color: 'var(--text)',
    borderLeftColor: 'var(--highlight-border)',
    background: 'var(--highlight)',
  },
  navIcon: {
    fontSize: 14,
    width: 18,
    textAlign: 'center',
    flexShrink: 0,
  },
  navLabel: { flex: 1 },
  navCount: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--text3)',
  },
  bottom: {
    padding: 16,
    borderTop: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  addBtn: {
    display: 'block',
    textAlign: 'center',
    padding: '9px 12px',
    background: 'var(--accent)',
    color: 'var(--on-brand)',
    borderRadius: 'var(--radius)',
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: '0.02em',
  },
  adminBtn: {
    display: 'block',
    textAlign: 'center',
    padding: '8px 12px',
    background: 'transparent',
    border: '1px solid var(--border2)',
    color: 'var(--text2)',
    borderRadius: 'var(--radius)',
    fontSize: 12,
    letterSpacing: '0.02em',
  },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  userEmail: {
    fontSize: 11,
    color: 'var(--text3)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  changePwBtn: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--text3)',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 3,
    padding: '2px 6px',
    cursor: 'pointer',
    letterSpacing: '0.08em',
    flexShrink: 0,
  },
  logoutBtn: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--text3)',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 3,
    padding: '2px 6px',
    cursor: 'pointer',
    letterSpacing: '0.08em',
  },
}
