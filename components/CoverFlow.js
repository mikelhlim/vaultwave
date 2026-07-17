'use client'
import { useState, useEffect, useMemo } from 'react'
import { TYPE_COLORS } from '@/lib/constants'

const TYPE_ICON = { vinyl: '⦿', cd: '◎', comic: '▣', manga: '◈' }
// Cards beyond this offset from center aren't rendered — keeps the DOM small
// on large collections since only a handful are ever visible anyway.
const WINDOW = 15

export default function CoverFlow({ items, onClick }) {
  const [centerIndex, setCenterIndex] = useState(0)
  const clampedCenter = Math.min(centerIndex, Math.max(0, items.length - 1))

  // Reset to the first item whenever the underlying list changes (a new
  // search/filter/sort) — pointing at a stale, now-unrelated item would be
  // more surprising than starting over.
  const idsKey = items.map(i => i.id).join(',')
  useEffect(() => { setCenterIndex(0) }, [idsKey])

  const visible = useMemo(() => {
    const start = Math.max(0, clampedCenter - WINDOW)
    const end = Math.min(items.length, clampedCenter + WINDOW + 1)
    return items.slice(start, end).map((item, i) => ({ item, offset: start + i - clampedCenter }))
  }, [items, clampedCenter])

  function handleKey(e) {
    if (e.key === 'ArrowRight') setCenterIndex(i => Math.min(items.length - 1, i + 1))
    if (e.key === 'ArrowLeft') setCenterIndex(i => Math.max(0, i - 1))
  }

  if (!items.length) return null
  const centerItem = items[clampedCenter]

  return (
    <div style={s.wrap} tabIndex={0} onKeyDown={handleKey}>
      <div style={s.stage}>
        {visible.map(({ item, offset }) => {
          const abs = Math.abs(offset)
          const isCenter = offset === 0
          const color = TYPE_COLORS[item.type] || 'var(--text3)'
          const cardStyle = {
            ...s.card,
            zIndex: 100 - abs,
            transform: `translateX(${offset * 60}px) translateZ(${-abs * 90}px) rotateY(${offset === 0 ? 0 : offset > 0 ? -45 : 45}deg) scale(${isCenter ? 1 : 0.72})`,
            opacity: abs > 8 ? 0 : 1 - abs * 0.09,
            pointerEvents: abs > 8 ? 'none' : 'auto',
          }
          return (
            <div
              key={item.id}
              style={cardStyle}
              onClick={() => (isCenter ? onClick(item) : setCenterIndex(clampedCenter + offset))}
            >
              {item.cover_url ? (
                <img src={item.cover_url} alt={item.title} style={s.img} />
              ) : (
                <div style={{ ...s.imgPlaceholder, borderColor: color + '33' }}>
                  <span style={{ fontSize: 32, color: color + '55' }}>{TYPE_ICON[item.type]}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {centerItem && (
        <div style={s.caption}>
          <p style={s.captionTitle}>{centerItem.title}</p>
          {(centerItem.artist || centerItem.author) && (
            <p style={s.captionSub}>{centerItem.artist || centerItem.author}</p>
          )}
        </div>
      )}

      <div style={s.nav}>
        <button
          style={{ ...s.navBtn, ...(clampedCenter === 0 ? s.navBtnDisabled : {}) }}
          onClick={() => setCenterIndex(i => Math.max(0, i - 1))}
          disabled={clampedCenter === 0}
        >‹</button>
        <span style={s.navPos}>{clampedCenter + 1} / {items.length}</span>
        <button
          style={{ ...s.navBtn, ...(clampedCenter === items.length - 1 ? s.navBtnDisabled : {}) }}
          onClick={() => setCenterIndex(i => Math.min(items.length - 1, i + 1))}
          disabled={clampedCenter === items.length - 1}
        >›</button>
      </div>
    </div>
  )
}

const s = {
  wrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px', outline: 'none' },
  stage: {
    position: 'relative', width: '100%', maxWidth: 900, height: 260,
    perspective: '1200px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  card: {
    position: 'absolute', left: '50%', top: '50%', width: 160, height: 160,
    marginLeft: -80, marginTop: -80, cursor: 'pointer',
    transition: 'transform 0.35s ease, opacity 0.35s ease',
    borderRadius: 'var(--radius)', overflow: 'hidden',
    boxShadow: '0 16px 32px rgba(0,0,0,0.5)',
  },
  img: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  imgPlaceholder: {
    width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg3)', border: '1px solid',
  },
  caption: { marginTop: 28, textAlign: 'center', minHeight: 44 },
  captionTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text)' },
  captionSub: { fontSize: 13, color: 'var(--text3)', marginTop: 3 },
  nav: { display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 },
  navBtn: {
    width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border2)',
    background: 'var(--bg2)', color: 'var(--text2)', fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font)',
  },
  navBtnDisabled: { opacity: 0.3, cursor: 'not-allowed' },
  navPos: { fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' },
}
