'use client'
import { TYPE_COLORS, CONDITIONS } from '@/lib/constants'

export function ShelfItem({ item, onClick }) {
  const color = TYPE_COLORS[item.type] || 'var(--text3)'

  return (
    <div style={s.shelfItem} onClick={() => onClick(item)}>
      {item.cover_url ? (
        <img
          src={item.cover_url}
          alt={item.title}
          style={s.cover}
          loading="lazy"
        />
      ) : (
        <div style={{ ...s.coverPlaceholder, borderColor: color + '33' }}>
          <span style={{ fontSize: 28, color: color + '66' }}>
            {item.type === 'vinyl' ? '⦿' : item.type === 'cd' ? '◎' : item.type === 'comic' ? '▣' : '◈'}
          </span>
          <span style={s.placeholderTitle}>{item.title}</span>
        </div>
      )}
      <span style={{ ...s.typeBadge, color, background: color + '22' }}>
        {item.type?.toUpperCase()}
      </span>
      <div style={s.overlay}>
        <div style={s.overlayTitle}>{item.title}</div>
        {(item.artist || item.author) && (
          <div style={s.overlaySub}>{item.artist || item.author}</div>
        )}
      </div>
    </div>
  )
}

export function ListItem({ item, onClick }) {
  const color = TYPE_COLORS[item.type] || 'var(--text3)'
  const condClass = item.condition?.replace('+', 'P')

  return (
    <div style={s.listItem} onClick={() => onClick(item)}>
      <div style={s.listThumb}>
        {item.cover_url ? (
          <img src={item.cover_url} alt={item.title} style={s.listThumbImg} loading="lazy" />
        ) : (
          <div style={{ ...s.listThumbPlaceholder, borderColor: color + '33' }}>
            <span style={{ color: color + '88', fontSize: 16 }}>
              {item.type === 'vinyl' ? '⦿' : item.type === 'cd' ? '◎' : item.type === 'comic' ? '▣' : '◈'}
            </span>
          </div>
        )}
      </div>
      <div style={s.listInfo}>
        <div style={s.listTitle}>{item.title}</div>
        <div style={s.listSub}>
          <span style={{ ...s.listTypeBadge, color, background: color + '1a' }}>
            {item.type?.toUpperCase()}
          </span>
          {(item.artist || item.author) && (
            <span style={s.listCreator}>{item.artist || item.author}</span>
          )}
          {item.year && <span style={s.listYear}>{item.year}</span>}
        </div>
      </div>
      {item.condition && (
        <span style={s.condBadge} className={`cond-${condClass}`}>
          {item.condition}
        </span>
      )}
      <span style={s.chevron}>›</span>
    </div>
  )
}

const s = {
  shelfItem: {
    position: 'relative',
    aspectRatio: '1',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    background: 'var(--bg3)',
    cursor: 'pointer',
    transition: 'transform 0.2s',
  },
  cover: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    border: '1px solid',
    background: 'var(--bg3)',
  },
  placeholderTitle: {
    fontSize: 10,
    color: 'var(--text3)',
    textAlign: 'center',
    padding: '0 8px',
    lineHeight: 1.3,
  },
  typeBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    fontFamily: 'var(--mono)',
    fontSize: 8,
    fontWeight: 500,
    letterSpacing: '0.1em',
    padding: '2px 5px',
    borderRadius: 3,
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 55%)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    padding: 8,
    opacity: 0,
    transition: 'opacity 0.2s',
  },
  overlayTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    lineHeight: 1.3,
  },
  overlaySub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  listThumb: {
    width: 42,
    height: 42,
    flexShrink: 0,
  },
  listThumbImg: {
    width: 42,
    height: 42,
    borderRadius: 4,
    objectFit: 'cover',
  },
  listThumbPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 4,
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg3)',
  },
  listInfo: {
    flex: 1,
    minWidth: 0,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  listSub: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
    flexWrap: 'wrap',
  },
  listTypeBadge: {
    fontFamily: 'var(--mono)',
    fontSize: 9,
    letterSpacing: '0.08em',
    padding: '1px 6px',
    borderRadius: 3,
  },
  listCreator: {
    fontSize: 12,
    color: 'var(--text2)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 180,
  },
  listYear: {
    fontFamily: 'var(--mono)',
    fontSize: 11,
    color: 'var(--text3)',
  },
  condBadge: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 3,
    flexShrink: 0,
  },
  chevron: {
    fontSize: 18,
    color: 'var(--text3)',
    flexShrink: 0,
  },
}
