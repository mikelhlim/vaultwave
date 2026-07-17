'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { ShelfItem, ListItem } from '@/components/ItemCard'
import DetailPanel from '@/components/DetailPanel'
import CoverFlow from '@/components/CoverFlow'
import { TYPE_COLORS } from '@/lib/constants'
import { setOverlayOpacity } from '@/lib/overlay'

function CollectionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialFilter = searchParams.get('view') || searchParams.get('type') || 'all'

  const [user, setUser] = useState(null)
  const [role, setRole] = useState('viewer')
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState(initialFilter)
  const [view, setView] = useState('shelf')
  const [search, setSearch] = useState('')
  const [searchFields, setSearchFields] = useState(new Set())
  const [condFilter, setCondFilter] = useState([])
  const [sort, setSort] = useState('recent')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const isAdmin = role === 'admin'

  // Field-scoped search only makes sense within a single type — reset
  // whenever the active type filter changes so a stale "Author" toggle
  // doesn't silently narrow a later "All Media" search.
  useEffect(() => {
    setSearchFields(new Set())
  }, [filter])

  function toggleSearchField(field) {
    setSearchFields(prev => {
      const next = new Set(prev)
      next.has(field) ? next.delete(field) : next.add(field)
      return next
    })
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setUser(data.user)
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
      setRole(profile?.role || 'viewer')
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

      // Field-scoped search chips (Title/Author for comics & manga,
      // Artist/Album for CDs & vinyl) narrow the search to just those
      // fields when active. With no chip active — or when the type filter
      // doesn't offer scoping — search falls back to every field.
      const scopedFieldsByType = {
        comic: ['title', 'author'],
        manga: ['title', 'author'],
        cd:    ['artist', 'album'],
        vinyl: ['artist', 'album'],
      }
      const activeScoped = scopedFieldsByType[filter]?.filter(f => searchFields.has(f))
      const fieldsToSearch = activeScoped?.length
        ? activeScoped
        : ['title', 'artist', 'author', 'album', 'publisher', 'genre', 'notes', 'year', 'condition', 'volume_number', 'issue_number', 'subtitle']

      return fieldsToSearch.some(f => String(i[f] ?? '').toLowerCase().includes(q))
    })
    .filter(i => condFilter.length === 0 || condFilter.includes(i.condition))
    .sort((a, b) => {
      // "Recent" is the unset default, not an explicit choice — when the
      // user hasn't picked a sort chip, let the active type filter pick a
      // more useful ordering than raw upload order (manga reads naturally
      // as series → volume; CD/vinyl groups naturally as artist → year).
      // An explicit chip click always wins over this.
      const effectiveSort = sort !== 'recent'
        ? sort
        : filter === 'manga' ? 'title'
        : (filter === 'cd' || filter === 'vinyl') ? 'artist'
        : 'recent'

      if (effectiveSort === 'title') {
        return (a.title || '').localeCompare(b.title || '')
          || (a.volume_number || 0) - (b.volume_number || 0)
      }
      if (effectiveSort === 'year')   return (b.year || 0) - (a.year || 0)
      if (effectiveSort === 'artist') return (a.artist || '').localeCompare(b.artist || '') || (b.year || 0) - (a.year || 0)
      return new Date(b.created_at) - new Date(a.created_at)
    })

  const typeGroups = ['vinyl', 'cd', 'comic', 'manga'].reduce((acc, t) => {
    const g = filtered.filter(i => i.type === t)
    if (g.length) acc[t] = g
    return acc
  }, {})

  const typeLabels = { vinyl: 'Vinyl Records', cd: 'CDs', comic: 'Comics', manga: 'Manga' }

  // Shelf view sub-groups within a type: manga clusters by title (all
  // volumes of a series under one heading), CD/vinyl clusters by artist.
  // Buckets by key regardless of array order — if the active sort isn't
  // the type-aware default, same-key items could otherwise land
  // non-adjacently and split into duplicate headers.
  function subgroupKeyFor(type) {
    if (type === 'manga') return item => item.title || 'Untitled'
    if (type === 'cd' || type === 'vinyl') return item => item.artist || 'Unknown Artist'
    return null
  }
  function buildSubgroups(items, type) {
    const keyFor = subgroupKeyFor(type)
    if (!keyFor) return null
    const order = []
    const buckets = new Map()
    for (const item of items) {
      const key = keyFor(item)
      if (!buckets.has(key)) { buckets.set(key, []); order.push(key) }
      buckets.get(key).push(item)
    }
    return order.map(key => [key, buckets.get(key)])
  }

  function renderShelfGrid(items) {
    return (
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
        {items.map(item => (
          <div key={item.id} data-shelf-item style={{ position: 'relative' }}>
            <ShelfItem
              item={item}
              onClick={setSelectedItem}
              isAdmin={isAdmin}
              selected={selectedIds.has(item.id)}
              onToggleSelect={toggleSelectItem}
              onDelete={deleteSingleItem}
            />
          </div>
        ))}
      </div>
    )
  }

  function handleDeleteItem(id) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function deleteSingleItem(item) {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    const { error } = await supabase.from('items').delete().eq('id', item.id)
    if (!error) handleDeleteItem(item.id)
  }

  function toggleSelectItem(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function deleteSelectedItems() {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} item${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setBulkDeleting(true)
    const ids = Array.from(selectedIds)
    const { error } = await supabase.from('items').delete().in('id', ids)
    if (!error) {
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)))
      setSelectedIds(new Set())
    }
    setBulkDeleting(false)
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
      <Sidebar user={user} counts={counts} role={role} />

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
            <button
              style={{ ...s.viewBtn, ...(view === 'coverflow' ? s.viewBtnActive : {}) }}
              onClick={() => setView('coverflow')}
              title="Cover Flow view"
            >⧉</button>
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
            {[['recent', 'Recent'], ['title', 'A–Z'], ['year', 'Year'], ['artist', 'Artist']].map(([val, label]) => (
              <button
                key={val}
                style={{ ...s.chip, ...(sort === val ? s.chipActive : {}) }}
                onClick={() => setSort(val)}
              >{label}</button>
            ))}
            {(filter === 'comic' || filter === 'manga') && (
              <>
                <span style={{ ...s.filterLabel, marginLeft: 12 }}>SEARCH IN</span>
                {[['title', 'Title'], ['author', 'Author']].map(([field, label]) => (
                  <button
                    key={field}
                    style={{ ...s.chip, ...(searchFields.has(field) ? s.chipActive : {}) }}
                    onClick={() => toggleSearchField(field)}
                  >{label}</button>
                ))}
              </>
            )}
            {(filter === 'cd' || filter === 'vinyl') && (
              <>
                <span style={{ ...s.filterLabel, marginLeft: 12 }}>SEARCH IN</span>
                {[['artist', 'Artist'], ['album', 'Album']].map(([field, label]) => (
                  <button
                    key={field}
                    style={{ ...s.chip, ...(searchFields.has(field) ? s.chipActive : {}) }}
                    onClick={() => toggleSearchField(field)}
                  >{label}</button>
                ))}
              </>
            )}
            {(condFilter.length > 0) && (
              <button style={{ ...s.chip, marginLeft: 8, color: 'var(--red)' }}
                onClick={() => setCondFilter([])}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Bulk select toolbar */}
        {isAdmin && selectedIds.size > 0 && (
          <div style={s.selectBar}>
            <span style={s.selectBarLabel}>{selectedIds.size} selected</span>
            <button style={s.selectBarClear} onClick={() => setSelectedIds(new Set())}>Clear</button>
            <button style={s.selectBarDelete} onClick={deleteSelectedItems} disabled={bulkDeleting}>
              {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size} item${selectedIds.size !== 1 ? 's' : ''}`}
            </button>
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
            Object.entries(typeGroups).map(([type, groupItems]) => {
              const subgroups = buildSubgroups(groupItems, type)
              return (
                <div key={type} style={s.shelfSection}>
                  <div style={s.shelfLabel}>
                    <span style={{ color: TYPE_COLORS[type] }}>{typeLabels[type]}</span>
                    <span style={s.shelfLabelCount}>{groupItems.length}</span>
                    <span style={s.shelfLabelLine} />
                  </div>
                  {subgroups ? (
                    subgroups.map(([key, subItems]) => (
                      <div key={key} style={s.subgroup}>
                        <div style={s.subgroupLabel}>
                          <span>{key}</span>
                          <span style={s.shelfLabelCount}>{subItems.length}</span>
                        </div>
                        {renderShelfGrid(subItems)}
                      </div>
                    ))
                  ) : renderShelfGrid(groupItems)}
                </div>
              )
            })
          ) : view === 'coverflow' ? (
            <CoverFlow items={filtered} onClick={setSelectedItem} />
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
              {Object.entries(typeGroups).map(([type, groupItems]) => {
                const subgroups = buildSubgroups(groupItems, type)
                return (
                  <div key={type}>
                    <div style={s.listTypeLabel}>
                      <span style={{ color: TYPE_COLORS[type] }}>{typeLabels[type]}</span>
                      <span style={s.shelfLabelCount}>{groupItems.length}</span>
                      <span style={s.shelfLabelLine} />
                    </div>
                    {(subgroups || [[null, groupItems]]).map(([key, subItems]) => (
                      <div key={key || 'flat'}>
                        {key && (
                          <div style={s.listSubgroupLabel}>
                            <span>{key}</span>
                            <span style={s.shelfLabelCount}>{subItems.length}</span>
                          </div>
                        )}
                        {subItems.map(item => (
                          <ListItem
                            key={item.id}
                            item={item}
                            onClick={setSelectedItem}
                            isAdmin={isAdmin}
                            selected={selectedIds.has(item.id)}
                            onToggleSelect={toggleSelectItem}
                            onDelete={deleteSingleItem}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {selectedItem && (
        <DetailPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onDelete={id => { handleDeleteItem(id); setSelectedItem(null) }}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}

export default function CollectionPageWrapper() {
  return (
    <Suspense fallback={null}>
      <CollectionPage />
    </Suspense>
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
    color: 'var(--text)',
    background: 'var(--highlight)',
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
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    background: 'transparent',
    color: 'var(--text2)',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'all 0.15s',
  },
  chipActive: {
    borderColor: 'var(--highlight-border)',
    color: 'var(--text)',
    background: 'var(--highlight)',
  },
  selectBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--highlight)',
  },
  selectBarLabel: {
    fontFamily: 'var(--mono)',
    fontSize: 11,
    color: 'var(--text)',
    letterSpacing: '0.06em',
  },
  selectBarClear: {
    padding: '4px 10px',
    borderRadius: 4,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text3)',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  selectBarDelete: {
    marginLeft: 'auto',
    padding: '6px 14px',
    borderRadius: 'var(--radius)',
    border: '1px solid rgba(224,85,85,0.3)',
    background: 'rgba(224,85,85,0.1)',
    color: 'var(--red)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
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
    color: 'var(--text)',
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
  subgroup: { marginBottom: 20 },
  subgroupLabel: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 7,
    marginBottom: 8,
    fontFamily: 'var(--font)',
    fontSize: 12.5,
    fontWeight: 600,
    color: 'var(--text2)',
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
  listTypeLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '14px 14px 8px',
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  listSubgroupLabel: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 7,
    padding: '6px 14px 4px',
    fontFamily: 'var(--font)',
    fontSize: 12.5,
    fontWeight: 600,
    color: 'var(--text2)',
  },
}
