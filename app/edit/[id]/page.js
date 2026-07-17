'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TYPE_FIELDS, FIELD_LABELS, CONDITIONS, TYPE_COLORS, nameFieldFor } from '@/lib/constants'

function EditItemPageInner() {
  const { id } = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  // Wherever the Edit button was clicked from (a specific type/wishlist/lent
  // filter, a search, etc.) — falls back to the unfiltered catalog if this
  // page was reached some other way (e.g. a bookmarked /edit/[id] URL).
  const from = searchParams.get('from') || '/collection'
  const fileRef = useRef(null)
  const [item, setItem] = useState(null)
  const [form, setForm] = useState({})
  const [type, setType] = useState('vinyl')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [coverUrl, setCoverUrl] = useState('')
  const [malId, setMalId] = useState(null)
  const [tracklist, setTracklist] = useState(null)
  const [coverCandidates, setCoverCandidates] = useState(null)
  const [pickingCover, setPickingCover] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [regenMessage, setRegenMessage] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') router.push('/')
    })()
  }, [])

  useEffect(() => {
    supabase.from('items').select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        setItem(data)
        setType(data.type || 'vinyl')
        setForm({
          title:         data.title || '',
          artist:        data.artist || '',
          album:         data.album || '',
          author:        data.author || '',
          publisher:     data.publisher || '',
          year:          data.year || '',
          genre:         data.genre || '',
          volume_number: data.volume_number || '',
          condition:     data.condition || '',
          notes:         data.notes || '',
        })
        setCoverUrl(data.cover_url || '')
        setMalId(data.external_id_jikan || null)
        setTracklist(data.tracklist || null)
      }
      setLoading(false)
    })
  }, [id])

  function update(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function regenerateCover() {
    const searchName = form[nameFieldFor(type)]
    if (!searchName) return
    setRegenerating(true)
    setRegenMessage(null)
    setCoverCandidates(null)
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title: searchName,
          artist: form.artist,
          author: form.author,
          volume: form.volume_number,
        }),
      })
      const enriched = await res.json()

      if (enriched.cover_url) setCoverUrl(enriched.cover_url)
      if (enriched.mal_id) setMalId(enriched.mal_id)
      if (enriched.tracklist) setTracklist(enriched.tracklist)

      const isMusic = type === 'vinyl' || type === 'cd'
      const hasCandidates = isMusic && enriched.cover_candidates?.length > 1
      if (hasCandidates) setCoverCandidates(enriched.cover_candidates)

      // Fill in any currently-empty fields from the match — never overwrite
      // something already there, since that may be a deliberate correction.
      // `album` only applies to vinyl/cd (Discogs returns the matched album
      // as `title`) — comics/manga have no album field, so writing it there
      // would silently corrupt the row with an orphaned value the form
      // never even shows.
      const fillable = {
        artist:    enriched.artist,
        ...(isMusic ? { album: enriched.album || enriched.title } : {}),
        author:    enriched.author,
        publisher: enriched.publisher,
        genre:     enriched.genre,
        year:      enriched.year,
      }
      const updates = {}
      for (const [key, value] of Object.entries(fillable)) {
        if (!form[key] && value) updates[key] = String(value)
      }
      const filledCount = Object.keys(updates).length
      if (filledCount) setForm(f => ({ ...f, ...updates }))

      if (hasCandidates) {
        setRegenMessage({ type: 'success', text: `Found ${enriched.cover_candidates.length} possible pressings — pick the right cover below.` })
      } else if (enriched.cover_url && filledCount) {
        setRegenMessage({ type: 'success', text: `Found a new cover and filled ${filledCount} empty field${filledCount !== 1 ? 's' : ''} — click Save Changes to keep them.` })
      } else if (enriched.cover_url) {
        setRegenMessage({ type: 'success', text: 'Found a new cover — click Save Changes to keep it.' })
      } else if (filledCount) {
        setRegenMessage({ type: 'success', text: `No cover found, but filled ${filledCount} empty field${filledCount !== 1 ? 's' : ''} — click Save Changes to keep them.` })
      } else {
        setRegenMessage({ type: 'error', text: 'No matching details found for these fields.' })
      }
    } catch {
      setRegenMessage({ type: 'error', text: 'Could not reach the enrichment service.' })
    } finally {
      setRegenerating(false)
    }
  }

  async function pickCoverCandidate(candidate) {
    setCoverUrl(candidate.cover_url || '')
    setCoverCandidates(null)
    setPickingCover(true)
    setRegenMessage(null)
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title: form[nameFieldFor(type)], artist: form.artist, discogsReleaseId: candidate.id }),
      })
      const detail = await res.json()
      if (detail.cover_url) setCoverUrl(detail.cover_url)
      if (detail.tracklist) setTracklist(detail.tracklist)
      setRegenMessage({ type: 'success', text: 'Cover selected — click Save Changes to keep it.' })
    } catch {
      setRegenMessage({ type: 'error', text: "Couldn't load that pressing's details, but the cover was still applied." })
    } finally {
      setPickingCover(false)
    }
  }

  async function handleFileUpload(file) {
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    setRegenMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('covers').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('covers').getPublicUrl(path)
      setCoverUrl(data.publicUrl)
      setRegenMessage({ type: 'success', text: 'Photo uploaded — click Save Changes to keep it.' })
    } catch (err) {
      setRegenMessage({ type: 'error', text: 'Upload failed: ' + (err.message || 'unknown error') })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function save() {
    setSaving(true)
    const isMusic = type === 'vinyl' || type === 'cd'
    const { error } = await supabase.from('items').update({
      type,
      title:         isMusic ? (form.album || '') : (form.title || ''),
      artist:        form.artist || null,
      album:         form.album || null,
      author:        form.author || null,
      publisher:     form.publisher || null,
      year:          form.year ? parseInt(form.year) : null,
      genre:         form.genre || null,
      volume_number: form.volume_number ? parseInt(form.volume_number) : null,
      condition:     form.condition || null,
      notes:         form.notes || null,
      cover_url:     coverUrl || null,
      external_id_jikan: malId || null,
      tracklist:     tracklist || null,
      updated_at:    new Date().toISOString(),
    }).eq('id', id)
    setSaving(false)
    if (!error) router.push(from)
    else alert('Error saving: ' + error.message)
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>
        LOADING...
      </div>
    )
  }

  if (!item) {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ color: 'var(--text2)' }}>Item not found.</p>
        <button style={{ marginTop: 12, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => router.push(from)}>← Back</button>
      </div>
    )
  }

  const fields = TYPE_FIELDS[type] || []

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <div style={s.pageHead}>
          <button style={s.backBtn} onClick={() => router.push(from)}>← Back</button>
          <div>
            <h1 style={s.pageTitle}>Edit Item</h1>
            <p style={s.pageSub}>{item.title}</p>
          </div>
        </div>

        {/* Cover preview */}
        <div style={s.coverPreview}>
          {coverUrl ? (
            <img src={coverUrl} alt={item.title} style={s.coverImg} />
          ) : (
            <div style={s.coverPlaceholder}>No cover</div>
          )}
          <div style={{ flex: 1 }}>
            <p style={s.coverLabel}>COVER</p>
            <p style={s.coverHint}>
              Edit the fields below, then regenerate to look up matching artwork and fill in anything still blank — or upload your own photo.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                style={{ ...s.regenBtn, ...(regenerating || !form[nameFieldFor(type)] ? s.regenBtnDisabled : {}) }}
                onClick={regenerateCover}
                disabled={regenerating || !form[nameFieldFor(type)]}
              >
                {regenerating ? 'Searching...' : '↻ Regenerate Cover & Details'}
              </button>
              <button
                style={{ ...s.regenBtn, ...(uploading ? s.regenBtnDisabled : {}) }}
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : '⤒ Upload Photo'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => handleFileUpload(e.target.files[0])}
              />
            </div>
            {regenMessage && (
              <p style={{ ...s.regenMsg, color: regenMessage.type === 'error' ? 'var(--red)' : 'var(--green)' }}>
                {regenMessage.text}
              </p>
            )}
          </div>
        </div>

        {coverCandidates && (
          <div style={s.candidateWrap}>
            <p style={s.coverLabel}>MULTIPLE PRESSINGS FOUND</p>
            <div style={s.candidateGrid}>
              {coverCandidates.map(c => (
                <button
                  key={c.id}
                  style={{ ...s.candidateBtn, ...(pickingCover ? s.regenBtnDisabled : {}) }}
                  onClick={() => pickCoverCandidate(c)}
                  disabled={pickingCover}
                >
                  {c.cover_url ? (
                    <img src={c.cover_url} alt={c.album} style={s.candidateImg} />
                  ) : (
                    <div style={s.coverPlaceholder}>No cover</div>
                  )}
                  <span style={s.candidateMeta}>{c.year || '—'}{c.format ? ` · ${c.format}` : ''}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Type selector */}
        <div style={{ marginBottom: 20 }}>
          <label style={s.label}>Media Type</label>
          <div style={s.typeGrid}>
            {['vinyl', 'cd', 'comic', 'manga'].map(t => (
              <button
                key={t}
                style={{
                  ...s.typeBtn,
                  ...(type === t ? {
                    borderColor: TYPE_COLORS[t],
                    color: TYPE_COLORS[t],
                    background: TYPE_COLORS[t] + '18',
                  } : {}),
                }}
                onClick={() => setType(t)}
              >
                <span style={{ fontSize: 20, display: 'block', marginBottom: 4 }}>
                  {t === 'vinyl' ? '⦿' : t === 'cd' ? '◎' : t === 'comic' ? '▣' : '◈'}
                </span>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Form fields */}
        <div style={s.formFields}>
          {fields.map(field => (
            <div key={field} style={s.formGroup}>
              <label style={s.label}>{FIELD_LABELS[field]}</label>
              {field === 'condition' ? (
                <select value={form[field] || ''} onChange={e => update(field, e.target.value)}>
                  <option value="">— Select condition —</option>
                  {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <input
                  type={field === 'year' || field === 'volume_number' ? 'number' : 'text'}
                  value={form[field] || ''}
                  onChange={e => update(field, e.target.value)}
                  placeholder={FIELD_LABELS[field]}
                />
              )}
            </div>
          ))}
        </div>

        <div style={s.actionRow}>
          <button style={s.cancelBtn} onClick={() => router.push(from)}>Cancel</button>
          <button
            style={{ ...s.saveBtn, ...(saving || !form[nameFieldFor(type)] ? s.saveBtnDisabled : {}) }}
            onClick={save}
            disabled={saving || !form[nameFieldFor(type)]}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EditItemPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: 40, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>
        LOADING...
      </div>
    }>
      <EditItemPageInner />
    </Suspense>
  )
}

const s = {
  page: { minHeight: '100vh', background: 'var(--bg)', padding: '40px 20px' },
  inner: { maxWidth: 500, margin: '0 auto' },
  pageHead: {
    display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28,
  },
  backBtn: {
    background: 'none', border: 'none', color: 'var(--text3)',
    fontSize: 14, cursor: 'pointer', padding: 0, fontFamily: 'var(--font)', marginTop: 3,
  },
  pageTitle: { fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' },
  pageSub: { fontSize: 12, color: 'var(--text3)', marginTop: 3 },
  coverPreview: {
    display: 'flex', gap: 14, alignItems: 'center', marginBottom: 24,
    padding: 14, background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
  },
  coverImg: { width: 64, height: 64, borderRadius: 'var(--radius)', objectFit: 'cover', flexShrink: 0 },
  coverPlaceholder: {
    width: 64, height: 64, borderRadius: 'var(--radius)', flexShrink: 0,
    background: 'var(--bg3)', border: '1px dashed var(--border2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textAlign: 'center', padding: 4,
  },
  coverLabel: {
    fontSize: 12, color: 'var(--text3)', marginBottom: 4,
    fontFamily: 'var(--mono)', letterSpacing: '0.08em',
  },
  coverHint: { fontSize: 13, color: 'var(--text2)', marginBottom: 10 },
  regenBtn: {
    padding: '6px 12px', background: 'transparent', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 12,
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  regenBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  regenMsg: { fontSize: 12, marginTop: 8, lineHeight: 1.5 },
  candidateWrap: {
    marginTop: -12, marginBottom: 24, padding: 14,
    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
  },
  candidateGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 10, marginTop: 8,
  },
  candidateBtn: {
    display: 'flex', flexDirection: 'column', gap: 4, padding: 6,
    background: 'transparent', border: '1px solid var(--border2)', borderRadius: 'var(--radius)',
    cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
  },
  candidateImg: { width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 'var(--radius)' },
  candidateMeta: { fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', lineHeight: 1.4 },
  label: {
    display: 'block', fontFamily: 'var(--mono)', fontSize: 10,
    color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6,
  },
  typeGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 },
  typeBtn: {
    padding: '10px 6px', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
    background: 'transparent', color: 'var(--text3)', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s', textAlign: 'center',
  },
  formFields: { display: 'flex', flexDirection: 'column', gap: 14 },
  formGroup: {},
  actionRow: { display: 'flex', gap: 10, marginTop: 28 },
  cancelBtn: {
    flex: 1, padding: 12, background: 'transparent', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', color: 'var(--text3)', fontSize: 13,
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  saveBtn: {
    flex: 2, padding: 12, background: 'var(--accent)', color: 'var(--on-brand)',
    border: 'none', borderRadius: 'var(--radius)', fontWeight: 700,
    fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font)', letterSpacing: '0.02em',
  },
  saveBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
}
