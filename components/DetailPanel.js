'use client'
import { TYPE_COLORS, CONDITION_LABELS } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import TrackList from './TrackList'

export default function DetailPanel({ item, onClose, onDelete, isAdmin }) {
  const router = useRouter()
  if (!item) return null

  const color = TYPE_COLORS[item.type] || 'var(--text3)'

  const META_ROWS = [
    ['Type',      item.type?.toUpperCase()],
    ['Artist',    item.artist],
    ['Album',     item.album],
    ['Author',    item.author],
    ['Publisher', item.publisher],
    ['Volume',    item.volume_number ? `Vol. ${item.volume_number}` : null],
    ['Year',      item.year],
    ['Genre',     item.genre],
    ['Condition', item.condition ? `${item.condition} — ${CONDITION_LABELS[item.condition] || ''}` : null],
    ['Notes',     item.notes],
    ['Added',     item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }) : null],
  ].filter(([_, v]) => v)

  async function handleDelete() {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    await supabase.from('items').delete().eq('id', item.id)
    onDelete(item.id)
    onClose()
  }

  async function toggleWishlist() {
    await supabase.from('items').update({ wishlist: !item.wishlist }).eq('id', item.id)
    onClose()
  }

  return (
    <>
      <div style={s.backdrop} onClick={onClose} />
      <div style={s.panel}>
        <div style={s.head}>
          <span style={{ ...s.typePill, color, background: color + '22' }}>
            {item.type?.toUpperCase()}
          </span>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={s.body}>
          {item.cover_url ? (
            <img src={item.cover_url} alt={item.title} style={s.coverImg} />
          ) : (
            <div style={{ ...s.coverPlaceholder, borderColor: color + '33' }}>
              <span style={{ fontSize: 56, color: color + '55' }}>
                {item.type === 'vinyl' ? '⦿' : item.type === 'cd' ? '◎' : item.type === 'comic' ? '▣' : '◈'}
              </span>
            </div>
          )}

          <h2 style={s.title}>{item.title}</h2>
          {(item.artist || item.author) && (
            <p style={s.creator}>{item.artist || item.author}</p>
          )}

          <div style={s.metaTable}>
            {META_ROWS.map(([k, v]) => (
              <div key={k} style={s.metaRow}>
                <span style={s.metaKey}>{k}</span>
                <span style={s.metaVal}>{v}</span>
              </div>
            ))}
          </div>

          <TrackList tracks={item.tracklist} />
        </div>

        {isAdmin && (
          <div style={s.actions}>
            <button
              style={s.actionBtn}
              onClick={() => router.push(`/edit/${item.id}?from=${encodeURIComponent(window.location.pathname + window.location.search)}`)}
            >
              Edit
            </button>
            <button
              style={{ ...s.actionBtn, color: item.wishlist ? 'var(--text)' : undefined }}
              onClick={toggleWishlist}
            >
              {item.wishlist ? '♥ Wishlisted' : '♡ Wishlist'}
            </button>
            <button style={{ ...s.actionBtn, color: 'var(--red)' }} onClick={handleDelete}>
              Delete
            </button>
          </div>
        )}
      </div>
    </>
  )
}

const s = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 40,
  },
  panel: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: 360,
    background: 'var(--bg2)',
    borderLeft: '1px solid var(--border2)',
    zIndex: 50,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'hidden',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
  },
  typePill: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.1em',
    padding: '3px 8px',
    borderRadius: 3,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text3)',
    fontSize: 16,
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: 20,
  },
  coverImg: {
    width: '100%',
    aspectRatio: '1',
    objectFit: 'cover',
    borderRadius: 'var(--radius-lg)',
    marginBottom: 20,
    display: 'block',
  },
  coverPlaceholder: {
    width: '100%',
    aspectRatio: '1',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg3)',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text)',
    lineHeight: 1.3,
    marginBottom: 4,
  },
  creator: {
    fontSize: 14,
    color: 'var(--text2)',
    marginBottom: 20,
  },
  metaTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '9px 0',
    borderBottom: '1px solid var(--border)',
    gap: 12,
  },
  metaKey: {
    fontSize: 11,
    fontFamily: 'var(--mono)',
    color: 'var(--text3)',
    flexShrink: 0,
    letterSpacing: '0.06em',
  },
  metaVal: {
    fontSize: 13,
    color: 'var(--text)',
    textAlign: 'right',
  },
  actions: {
    display: 'flex',
    gap: 8,
    padding: '16px 20px',
    borderTop: '1px solid var(--border)',
  },
  actionBtn: {
    flex: 1,
    padding: '9px 8px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text2)',
    fontSize: 12,
    fontFamily: 'var(--font)',
    cursor: 'pointer',
    transition: 'all 0.15s',
    textAlign: 'center',
  },
}
