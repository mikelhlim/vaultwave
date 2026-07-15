'use client'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TYPE_COLORS } from '@/lib/constants'

const NAV_ITEMS = [
  { label: 'All Media',   filter: 'all',   icon: '▦' },
  { label: 'Vinyl',       filter: 'vinyl', icon: '⦿' },
  { label: 'CDs',         filter: 'cd',    icon: '◎' },
  { label: 'Comics',      filter: 'comic', icon: '▣' },
  { label: 'Manga',       filter: 'manga', icon: '◈' },
]

export default function Sidebar({ user, counts = {}, activeFilter, onFilter, role }) {
  const router = useRouter()
  const isAdmin = role === 'admin'

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <aside style={s.sidebar}>
      <div style={s.logoWrap}>
        <div style={s.logo}>VAULTWAVE</div>
        <div style={s.logoSub}>Media Collection</div>
      </div>

      <nav style={s.nav}>
        <div style={s.navSection}>Library</div>
        {NAV_ITEMS.map(({ label, filter, icon }) => {
          const count = filter === 'all' ? total : (counts[filter] || 0)
          const active = activeFilter === filter
          return (
            <button
              key={filter}
              style={{ ...s.navItem, ...(active ? s.navItemActive : {}) }}
              onClick={() => onFilter(filter)}
            >
              <span style={{
                ...s.navIcon,
                color: active
                  ? (filter === 'all' ? 'var(--gold)' : TYPE_COLORS[filter])
                  : 'var(--text3)',
              }}>
                {icon}
              </span>
              <span style={s.navLabel}>{label}</span>
              {count > 0 && (
                <span style={s.navCount}>{count}</span>
              )}
            </button>
          )
        })}

        <div style={{ ...s.navSection, marginTop: 16 }}>Collections</div>
        <button style={s.navItem} onClick={() => onFilter('wishlist')}>
          <span style={{ ...s.navIcon, color: 'var(--text3)' }}>♡</span>
          <span style={s.navLabel}>Wishlist</span>
          {counts.wishlist > 0 && <span style={s.navCount}>{counts.wishlist}</span>}
        </button>
        <button style={s.navItem} onClick={() => onFilter('lent')}>
          <span style={{ ...s.navIcon, color: 'var(--text3)' }}>↗</span>
          <span style={s.navLabel}>Lent Out</span>
          {counts.lent > 0 && <span style={s.navCount}>{counts.lent}</span>}
        </button>
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
    padding: '20px 18px 16px',
    borderBottom: '1px solid var(--border)',
  },
  logo: {
    fontFamily: 'var(--mono)',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--gold)',
    letterSpacing: '0.14em',
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
    borderLeft: '2px solid transparent',
    color: 'var(--text2)',
    fontSize: 13,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  navItemActive: {
    color: 'var(--gold)',
    borderLeftColor: 'var(--gold)',
    background: 'var(--gold-dim)',
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
    background: 'var(--gold)',
    color: '#1a1000',
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
