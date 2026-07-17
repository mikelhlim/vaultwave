'use client'
import { useState } from 'react'
import { TYPE_COLORS } from '@/lib/constants'

export default function PublicProfileClient({ profile, items, slug }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = items
    .filter(i => filter === 'all' || i.type === filter)
    .filter(i => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        i.title?.toLowerCase().includes(q) ||
        i.artist?.toLowerCase().includes(q) ||
        i.author?.toLowerCase().includes(q)
      )
    })

  const counts = {
    all: items.length,
    vinyl: items.filter(i => i.type === 'vinyl').length,
    cd: items.filter(i => i.type === 'cd').length,
    comic: items.filter(i => i.type === 'comic').length,
    manga: items.filter(i => i.type === 'manga').length,
  }

  const typeGroups = ['vinyl', 'cd', 'comic', 'manga'].reduce((acc, t) => {
    const g = filtered.filter(i => i.type === t)
    if (g.length) acc[t] = g
    return acc
  }, {})

  const typeLabels = { vinyl: 'Vinyl Records', cd: 'CDs', comic: 'Comics', manga: 'Manga' }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerInner}>
          <div>
            <div style={s.logo}><span style={s.logoDot} />VAULTWAVE</div>
            <h1 style={s.profileName}>{profile.display_name || slug}&apos;s Collection</h1>
            <p style={s.profileMeta}>{items.length} items · Public collection</p>
          </div>
          <a href="/" style={s.ctaBtn}>Build your own vault →</a>
        </div>
      </header>

      <div style={s.body}>
        {/* Filters */}
        <div style={s.filterRow}>
          <div style={s.searchWrap}>
            <input
              style={s.searchInput}
              type="text"
              placeholder="Search collection..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={s.typeFilters}>
            {['all', 'vinyl', 'cd', 'comic', 'manga'].map(t => (
              counts[t] > 0 && (
                <button
                  key={t}
                  style={{
                    ...s.typeChip,
                    ...(filter === t ? {
                      borderColor: t === 'all' ? 'var(--highlight-border)' : TYPE_COLORS[t] + '55',
                      color: t === 'all' ? 'var(--text)' : TYPE_COLORS[t],
                      background: t === 'all' ? 'var(--highlight)' : TYPE_COLORS[t] + '18',
                    } : {}),
                  }}
                  onClick={() => setFilter(t)}
                >
                  {t === 'all' ? `All (${counts.all})` : `${t[0].toUpperCase() + t.slice(1)} (${counts[t]})`}
                </button>
              )
            ))}
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div style={s.empty}>
            <p style={{ color: 'var(--text3)', fontSize: 14 }}>No items match your search.</p>
          </div>
        ) : (
          Object.entries(typeGroups).map(([type, groupItems]) => (
            <div key={type} style={s.section}>
              <div style={s.sectionLabel}>
                <span style={{ color: TYPE_COLORS[type] }}>{typeLabels[type]}</span>
                <span style={s.sectionCount}>{groupItems.length}</span>
                <span style={s.sectionLine} />
              </div>
              <div style={s.grid}>
                {groupItems.map(item => {
                  const color = TYPE_COLORS[item.type]
                  return (
                    <div key={item.id} style={s.card}>
                      <div style={s.cardCover}>
                        {item.cover_url ? (
                          <img src={item.cover_url} alt={item.title} style={s.coverImg} loading="lazy" />
                        ) : (
                          <div style={{ ...s.coverPlaceholder, borderColor: color + '33' }}>
                            <span style={{ fontSize: 32, color: color + '55' }}>
                              {item.type === 'vinyl' ? '⦿' : item.type === 'cd' ? '◎' : item.type === 'comic' ? '▣' : '◈'}
                            </span>
                          </div>
                        )}
                        <span style={{ ...s.badge, color, background: color + '22' }}>
                          {item.type?.toUpperCase()}
                        </span>
                      </div>
                      <div style={s.cardInfo}>
                        <p style={s.cardTitle}>{item.title}</p>
                        <p style={s.cardSub}>{item.artist || item.author || ''}</p>
                        {item.year && <p style={s.cardYear}>{item.year}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <footer style={s.footer}>
        <span style={s.footerText}>Powered by </span>
        <a href="/" style={s.footerLink}>VAULTWAVE</a>
      </footer>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  header: {
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)',
    padding: '24px 20px',
  },
  headerInner: {
    maxWidth: 1100,
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: 16,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--text)',
    letterSpacing: '0.14em',
    marginBottom: 8,
  },
  logoDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: 'var(--accent)',
    flexShrink: 0,
  },
  profileName: { fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' },
  profileMeta: { fontSize: 12, color: 'var(--text3)', marginTop: 4 },
  ctaBtn: {
    padding: '9px 18px',
    background: 'var(--accent)',
    color: 'var(--on-brand)',
    borderRadius: 'var(--radius)',
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
    flexShrink: 0,
  },
  body: { maxWidth: 1100, margin: '0 auto', padding: '24px 20px' },
  filterRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 28,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  searchWrap: { flex: 1, minWidth: 200 },
  searchInput: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '8px 12px',
    color: 'var(--text)',
    fontSize: 13,
    width: '100%',
    outline: 'none',
  },
  typeFilters: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  typeChip: {
    padding: '5px 12px',
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    background: 'transparent',
    color: 'var(--text3)',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'all 0.15s',
  },
  empty: { padding: '60px 0', textAlign: 'center' },
  section: { marginBottom: 36 },
  sectionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  sectionCount: { color: 'var(--text3)', fontSize: 10 },
  sectionLine: { flex: 1, height: 1, background: 'var(--border)' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 8,
  },
  card: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
  },
  cardCover: { position: 'relative', aspectRatio: '1' },
  coverImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid',
    background: 'var(--bg3)',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    fontFamily: 'var(--mono)',
    fontSize: 8,
    letterSpacing: '0.1em',
    padding: '2px 5px',
    borderRadius: 3,
  },
  cardInfo: { padding: '8px 10px 10px' },
  cardTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 },
  cardSub: { fontSize: 11, color: 'var(--text3)', marginTop: 2 },
  cardYear: { fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 2 },
  footer: {
    textAlign: 'center',
    padding: '24px',
    borderTop: '1px solid var(--border)',
    marginTop: 40,
  },
  footerText: { fontSize: 12, color: 'var(--text3)' },
  footerLink: { fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)', letterSpacing: '0.1em' },
}
