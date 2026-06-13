'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { ShelfItem, ListItem } from '@/components/ItemCard'
import DetailPanel from '@/components/DetailPanel'
import { TYPE_COLORS } from '@/lib/constants'
import { setOverlayOpacity } from '@/lib/overlay'

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState('shelf')
  const [search, setSearch] = useState('')
  const [condFilter, setCondFilter] = useState([])
  const [sort, setSort] = useState('recent')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setUser(data.user)
      fetchItems()
    })
  }, [])

  async function fetchItems() {
    const { data } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  const counts = {
    vinyl:   items.filter(i => i.type === 'vinyl').length,
    cd:      items.filter(i => i.type === 'cd').length,
    comic:   items.filter(i => i.type === 'comic').length,
    manga:   items.filter(i => i.type === 'manga').length,
    wishlist:items.filter(i => i.wishlist).length,
    lent:    items.filter(i => i.lent_to).length,
  }

  const filtered = items
    .filter(i => {
      if (filter === 'wishlist') return i.wishlist
      if (filter === 'lent')    return i.lent_to
      if (filter !== 'all')     return i.type === filter
      return true
    })
    .filter(i => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        i.title?.toLowerCase().includes(q) ||
        i.artist?.toLowerCase().includes(q) ||
        i.author?.toLowerCase().includes(q) ||
        i.album?.toLowerCase().includes(q) ||
        i.publisher?.toLowerCase().includes(q) ||
        i.genre?.toLowerCase().includes(q)
      )
    })
    .filter(i => condFilter.length === 0 || condFilter.includes(i.condition))
    .sort((a, b) => {
      if (sort === 'title') return (a.title || '').localeCompare(b.title || '')
      if (sort === 'year')  return (b.year || 0) - (a.year || 0)
      return new Date(b.created_at) - new Date(a.created_at)
    })

  const typeGroups = ['vinyl', 'cd', 'comic', 'manga'].reduce((acc, t) => {
    const g = filtered.filter(i => i.type === t)
    if (g.length) acc[t] = g
    return acc
  }, {})

  const typeLabels = { vinyl: 'Vinyl Records', cd: 'CDs', comic: 'Comics', manga: 'Manga' }

  function handleDeleteItem(id) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)', letterSpacing: '0.1em' }}>
          LOADING...
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar user={user} counts={counts} activeFilter={filter} onFilter={setFilter} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <div style={s.topbar}>
          <div style={s.searchWrap}>
            <span style={s.searchIcon}>⌕</span>
            <input
              style={s.searchInput}
              type="text"
              placeholder="Search titles, artists, authors..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={s.viewToggle}>
            <button
              style={{ ...s.viewBtn, ...(view === 'shelf' ? s.viewBtnActive : {}) }}
              onClick={() => setView('shelf')}
              title="Shelf view"
            >⊞</button>
            <button
              style={{ ...s.viewBtn, ...(view === 'list' ? s.viewBtnActive : {}) }}
              onClick={() => setView('list')}
              title="List view"
            >≡</button>
          </div>
          <button style={s.filterBtn} onClick={() => setShowFilters(v => !v)}>
            ⊟ Filter
          </button>
        </div>

        {/* Filters bar */}
        {showFilters && (
          <div style={s.filtersBar}>
            <span style={s.filterLabel}>CONDITION</span>
            {['NM', 'VG+', 'VG', 'G', 'F'].map(c => (
              <button
                key={c}
                style={{
                  ...s.chip,
                  ...(condFilter.includes(c) ? s.chipActive : {}),
                }}
                onClick={() => setCondFilter(prev =>
                  prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                )}
              >{c}</button>
            ))}
            <span style={{ ...s.filterLabel, marginLeft: 12 }}>SORT</span>
            {[['recent', 'Recent'], ['title', 'A–Z'], ['year', 'Year']].map(([val, label]) => (
              <button
                key={val}
                style={{ ...s.chip, ...(sort === val ? s.chipActive : {}) }}
                onClick={() => setSort(val)}
              >{label}</button>
            ))}
            {(condFilter.length > 0) && (
              <button style={{ ...s.chip, marginLeft: 8, color: 'var(--red)' }}
                onClick={() => setCondFilter([])}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Stats bar */}
        <div style={s.statsBar}>
          {[
            ['Total', items.length],
            ['Vinyl', counts.vinyl],
            ['CDs', counts.cd],
            ['Comics & Manga', counts.comic + counts.manga],
          ].map(([label, val]) => (
            <div key={label} style={s.stat}>
              <span style={s.statNum}>{val}</span>
              <span style={s.statLabel}>{label}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={s.content}>
          {filtered.length === 0 ? (
            <div style={s.empty}>
              <span style={s.emptyIcon}>◎</span>
              <p style={s.emptyTitle}>
                {items.length === 0 ? 'Your vault is empty' : 'No items match your search'}
              </p>
              <p style={s.emptySub}>
                {items.length === 0
                  ? 'Add your first item by clicking "+ Add Item" in the sidebar.'
                  : 'Try adjusting your search or filters.'}
              </p>
            </div>
          ) : view === 'shelf' ? (
            Object.entries(typeGroups).map(([type, groupItems]) => (
              <div key={type} style={s.shelfSection}>
                <div style={s.shelfLabel}>
                  <span style={{ color: TYPE_COLORS[type] }}>{typeLabels[type]}</span>
                  <span style={s.shelfLabelCount}>{groupItems.length}</span>
                  <span style={s.shelfLabelLine} />
                </div>
                <div
                  style={s.shelfGrid}
                  onMouseOver={e => {
                    const card = e.target?.closest?.('[data-shelf-item]') || null
                    setOverlayOpacity(card, '1')
                  }}
                  onMouseOut={e => {
                    const card = e.target?.closest?.('[data-shelf-item]') || null
                    setOverlayOpacity(card, '0')
                  }}
                >
                  {groupItems.map(item => (
                    <div key={item.id} data-shelf-item style={{ position: 'relative' }}>
                      <ShelfItem item={item} onClick={setSelectedItem} />
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div>
              <div style={s.listHeader}>
                <span />
                <span style={s.listHeaderCell}>Title</span>
                <span style={s.listHeaderCell}>Creator</span>
                <span style={s.listHeaderCell}>Year</span>
                <span style={s.listHeaderCell}>Cond.</span>
                <span />
              </div>
              {filtered.map(item => (
                <ListItem key={item.id} item={item} onClick={setSelectedItem} />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedItem && (
        <DetailPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onDelete={id => { handleDeleteItem(id); setSelectedItem(null) }}
        />
      )}
    </div>
  )
}

const s = {
  topbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg)',
  },
  searchWrap: { flex: 1, position: 'relative' },
  searchIcon: {
    position: 'absolute',
    left: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text3)',
    fontSize: 18,
    pointerEvents: 'none',
  },
  searchInput: {
    paddingLeft: 32,
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
  },
  viewToggle: {
    display: 'flex',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
  },
  viewBtn: {
    padding: '7px 10px',
    background: 'transparent',
    border: 'none',
    color: 'var(--text3)',
    fontSize: 18,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  viewBtnActive: {
    color: 'var(--gold)',
    background: 'var(--gold-dim)',
  },
  filterBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text2)',
    fontSize: 13,
    cursor: 'pointer',
  },
  filtersBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 20px',
    borderBottom: '1px solid var(--border)',
    flexWrap: 'wrap',
  },
  filterLabel: {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    color: 'var(--text3)',
    letterSpacing: '0.1em',
  },
  chip: {
    padding: '4px 12px',
    borderRadius: 20,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text2)',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'all 0.15s',
  },
  chipActive: {
    borderColor: 'var(--gold-border)',
    color: 'var(--gold)',
    background: 'var(--gold-dim)',
  },
  statsBar: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
  },
  stat: {
    flex: 1,
    padding: '10px 20px',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  statNum: {
    fontFamily: 'var(--mono)',
    fontSize: 20,
    fontWeight: 500,
    color: 'var(--gold)',
  },
  statLabel: {
    fontSize: 11,
    color: 'var(--text3)',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    textAlign: 'center',
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
    color: 'var(--text3)',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text2)',
  },
  emptySub: {
    fontSize: 13,
    color: 'var(--text3)',
    maxWidth: 280,
    lineHeight: 1.6,
  },
  shelfSection: { marginBottom: 32 },
  shelfLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  shelfLabelCount: {
    color: 'var(--text3)',
    fontSize: 10,
  },
  shelfLabelLine: {
    flex: 1,
    height: 1,
    background: 'var(--border)',
  },
  shelfGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: 4,
  },
  listHeader: {
    display: 'grid',
    gridTemplateColumns: '42px 1fr 160px 70px 60px 20px',
    gap: 12,
    padding: '0 14px 8px',
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--text3)',
    letterSpacing: '0.06em',
    borderBottom: '1px solid var(--border)',
    marginBottom: 4,
  },
  listHeaderCell: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
}
