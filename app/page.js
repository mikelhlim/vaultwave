'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { ShelfItem } from '@/components/ItemCard'
import DetailPanel from '@/components/DetailPanel'
import { TYPE_COLORS } from '@/lib/constants'

const TYPE_LABELS = { vinyl: 'Vinyl Records', cd: 'CDs', comic: 'Comics', manga: 'Manga' }
const MEDIA_TYPES = ['vinyl', 'cd', 'comic', 'manga']

function NewsRow({ image, title, meta, url }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={s.newsRow}>
      {image ? <img src={image} alt="" style={s.newsRowImg} /> : <div style={s.newsRowImgPlaceholder} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={s.newsRowTitle}>{title}</p>
        {meta && <p style={s.newsRowMeta}>{meta}</p>}
      </div>
    </a>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [role, setRole] = useState('viewer')
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [selectedItem, setSelectedItem] = useState(null)
  const [newsLoading, setNewsLoading] = useState(true)
  const [mangaCollectionNews, setMangaCollectionNews] = useState([])
  const [mangaPublishingNews, setMangaPublishingNews] = useState([])
  const [albumNews, setAlbumNews] = useState([])
  const [publisherNews, setPublisherNews] = useState([])

  const isAdmin = role === 'admin'

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setUser(data.user)
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
      setRole(profile?.role || 'viewer')
      const { data: itemData } = await supabase
        .from('items')
        .select('*')
        .order('created_at', { ascending: false })
      setItems(itemData || [])
      setLoading(false)
    })
  }, [])

  // News feed — fires once items are loaded, since the collection-scoped
  // manga feed needs the user's own external_id_jikan values first.
  useEffect(() => {
    if (loading) return
    const malIds = Array.from(new Set(
      items.filter(i => i.type === 'manga' && i.external_id_jikan).map(i => i.external_id_jikan)
    ))

    Promise.all([
      malIds.length
        ? fetch('/api/news/manga', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ malIds }),
          }).then(r => r.json()).catch(() => ({ items: [] }))
        : Promise.resolve({ items: [] }),
      fetch('/api/news/manga').then(r => r.json()).catch(() => ({ items: [] })),
      fetch('/api/news/albums').then(r => r.json()).catch(() => ({ items: [] })),
      fetch('/api/news/publisher').then(r => r.json()).catch(() => ({ items: [] })),
    ]).then(([collection, publishing, albums, publisher]) => {
      setMangaCollectionNews(collection.items || [])
      setMangaPublishingNews(publishing.items || [])
      setAlbumNews(albums.items || [])
      setPublisherNews(publisher.items || [])
      setNewsLoading(false)
    })
  }, [loading])

  // Mutually-exclusive type counts only — wishlist/lent are not exclusive
  // with a type, so they must never be summed into a "total" alongside these.
  const counts = {
    vinyl: items.filter(i => i.type === 'vinyl').length,
    cd:    items.filter(i => i.type === 'cd').length,
    comic: items.filter(i => i.type === 'comic').length,
    manga: items.filter(i => i.type === 'manga').length,
  }

  const recentByType = MEDIA_TYPES.reduce((acc, t) => {
    const g = items.filter(i => i.type === t).slice(0, 6)
    if (g.length) acc[t] = g
    return acc
  }, {})

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
      <Sidebar user={user} counts={counts} role={role} />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={s.page}>
          <div style={s.pageHead}>
            <h1 style={s.pageTitle}>Dashboard</h1>
            <a href="/collection" style={s.viewAllLink}>Browse full collection →</a>
          </div>

          {/* Counts by type */}
          <div style={s.statsGrid}>
            {MEDIA_TYPES.map(t => (
              <a key={t} href={`/collection?type=${t}`} style={s.statCard}>
                <span style={{ ...s.statNum, color: TYPE_COLORS[t] }}>{counts[t]}</span>
                <span style={s.statLabel}>{TYPE_LABELS[t]}</span>
              </a>
            ))}
          </div>

          {/* Recently uploaded, by type */}
          <div style={s.sectionHead}>
            <span style={s.sectionEyebrow}>RECENTLY UPLOADED</span>
          </div>

          {Object.keys(recentByType).length === 0 ? (
            <div style={s.empty}>
              <p style={s.emptyTitle}>Your vault is empty</p>
              <p style={s.emptySub}>
                {isAdmin ? 'Add your first item from the sidebar.' : 'Nothing has been added yet.'}
              </p>
            </div>
          ) : (
            MEDIA_TYPES.filter(t => recentByType[t]).map(t => (
              <div key={t} style={s.shelfSection}>
                <div style={s.shelfLabel}>
                  <span style={{ color: TYPE_COLORS[t] }}>{TYPE_LABELS[t]}</span>
                  <span style={s.shelfLabelLine} />
                  <a href={`/collection?type=${t}`} style={s.shelfLabelLink}>View all →</a>
                </div>
                <div style={s.shelfGrid}>
                  {recentByType[t].map(item => (
                    <ShelfItem key={item.id} item={item} onClick={setSelectedItem} isAdmin={false} />
                  ))}
                </div>
              </div>
            ))
          )}

          {/* News feed */}
          <div style={s.sectionHead}>
            <span style={s.sectionEyebrow}>NEWS FEED</span>
          </div>
          <div style={s.newsGrid}>
            <div style={s.newsCard}>
              <p style={s.newsCardTitle}>From your collection</p>
              {newsLoading ? (
                <p style={s.newsCardSub}>Loading...</p>
              ) : mangaCollectionNews.length === 0 ? (
                <p style={s.newsCardSub}>
                  {items.some(i => i.type === 'manga' && i.external_id_jikan)
                    ? 'No recent news for the manga you own.'
                    : items.some(i => i.type === 'manga')
                    ? 'None of your manga are linked yet — edit an item and regenerate its cover to connect it.'
                    : 'Add manga to your collection to see news for it here.'}
                </p>
              ) : (
                <div style={s.newsList}>
                  {mangaCollectionNews.slice(0, 5).map(n => (
                    <NewsRow
                      key={n.url}
                      image={n.image_url}
                      title={n.title}
                      meta={n.date ? new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      url={n.url}
                    />
                  ))}
                </div>
              )}
            </div>

            <div style={s.newsCard}>
              <p style={s.newsCardTitle}>Recently publishing</p>
              {newsLoading ? (
                <p style={s.newsCardSub}>Loading...</p>
              ) : mangaPublishingNews.length === 0 ? (
                <p style={s.newsCardSub}>No manga news available right now.</p>
              ) : (
                <div style={s.newsList}>
                  {mangaPublishingNews.slice(0, 5).map(n => (
                    <NewsRow
                      key={n.url}
                      image={n.image_url}
                      title={n.title}
                      meta={n.authors?.length ? n.authors.join(', ') : ''}
                      url={n.url}
                    />
                  ))}
                </div>
              )}
            </div>

            <div style={s.newsCard}>
              <p style={s.newsCardTitle}>New releases</p>
              {newsLoading ? (
                <p style={s.newsCardSub}>Loading...</p>
              ) : albumNews.length === 0 ? (
                <p style={s.newsCardSub}>No matching new releases right now.</p>
              ) : (
                <div style={s.newsList}>
                  {albumNews.slice(0, 5).map(a => (
                    <NewsRow
                      key={a.url}
                      image={a.image_url}
                      title={a.title}
                      meta={[a.artist, a.genre].filter(Boolean).join(' · ')}
                      url={a.url}
                    />
                  ))}
                </div>
              )}
            </div>

            <div style={s.newsCard}>
              <p style={s.newsCardTitle}>Publisher news — Kodansha</p>
              {newsLoading ? (
                <p style={s.newsCardSub}>Loading...</p>
              ) : publisherNews.length === 0 ? (
                <p style={s.newsCardSub}>No publisher news available right now.</p>
              ) : (
                <div style={s.newsList}>
                  {publisherNews.slice(0, 5).map(n => (
                    <NewsRow
                      key={n.url}
                      image={n.image_url}
                      title={n.title}
                      meta={n.date ? new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      url={n.url}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
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

const s = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '32px 24px 60px' },
  pageHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 24,
  },
  pageTitle: { fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px' },
  viewAllLink: {
    fontSize: 13, color: 'var(--text3)',
  },
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 10, marginBottom: 36,
  },
  statCard: {
    display: 'flex', flexDirection: 'column', gap: 4,
    padding: '16px 18px', background: 'var(--bg2)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
    transition: 'border-color 0.15s',
  },
  statNum: { fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 500 },
  statLabel: { fontSize: 12, color: 'var(--text3)' },
  sectionHead: { marginBottom: 14, marginTop: 8 },
  sectionEyebrow: {
    fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em',
    color: 'var(--text3)', textTransform: 'uppercase',
  },
  empty: {
    padding: '40px 20px', textAlign: 'center', background: 'var(--bg2)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: 36,
  },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 },
  emptySub: { fontSize: 13, color: 'var(--text3)' },
  shelfSection: { marginBottom: 28 },
  shelfLabel: {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
    fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
  },
  shelfLabelLine: { flex: 1, height: 1, background: 'var(--border)' },
  shelfLabelLink: {
    fontFamily: 'var(--font)', fontSize: 12, color: 'var(--text3)',
    letterSpacing: 'normal', textTransform: 'none',
  },
  shelfGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 4,
  },
  newsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12,
  },
  newsCard: {
    padding: 18, background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
  },
  newsCardTitle: {
    fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: 'var(--text3)', marginBottom: 12,
  },
  newsCardSub: { fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 },
  newsList: { display: 'flex', flexDirection: 'column', gap: 10 },
  newsRow: {
    display: 'flex', gap: 10, alignItems: 'center',
    color: 'inherit', textDecoration: 'none',
  },
  newsRowImg: { width: 36, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 },
  newsRowImgPlaceholder: { width: 36, height: 36, borderRadius: 4, background: 'var(--bg3)', flexShrink: 0 },
  newsRowTitle: {
    fontSize: 12.5, color: 'var(--text)', lineHeight: 1.4,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  newsRowMeta: { fontSize: 11, color: 'var(--text3)', marginTop: 2 },
}
