'use client'

export default function TrackList({ tracks }) {
  if (!tracks?.length) return null

  return (
    <div style={s.wrap}>
      <p style={s.label}>TRACKLIST</p>
      <div style={s.list}>
        {tracks.map((t, i) => (
          <div key={i} style={s.row}>
            <span style={s.position}>{t.position || i + 1}</span>
            <span style={s.title}>{t.title}</span>
            {t.duration && <span style={s.duration}>{t.duration}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

const s = {
  wrap: { marginTop: 20 },
  label: {
    fontSize: 11,
    fontFamily: 'var(--mono)',
    color: 'var(--text3)',
    letterSpacing: '0.08em',
    marginBottom: 8,
  },
  list: { display: 'flex', flexDirection: 'column' },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
    padding: '6px 0',
    borderBottom: '1px solid var(--border)',
  },
  position: {
    fontSize: 11,
    fontFamily: 'var(--mono)',
    color: 'var(--text3)',
    flexShrink: 0,
    width: 28,
  },
  title: { fontSize: 13, color: 'var(--text)', flex: 1, lineHeight: 1.4 },
  duration: { fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)', flexShrink: 0 },
}
