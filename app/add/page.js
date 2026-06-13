'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TYPE_FIELDS, FIELD_LABELS, CONDITIONS, TYPE_COLORS } from '@/lib/constants'

const TYPE_ICON = { vinyl: '⦿', cd: '◎', comic: '▣', manga: '◈' }

// ─── Single item inline form ──────────────────────────────────────────────────
function ItemForm({ item, onChange, onTypeChange }) {
  const fields = TYPE_FIELDS[item.type] || []

  return (
    <div style={s.itemForm}>
      {/* Type picker */}
      <div style={{ marginBottom: 16 }}>
        <label style={s.label}>Media Type</label>
        <div style={s.typeGrid}>
          {['vinyl', 'cd', 'comic', 'manga'].map(t => (
            <button
              key={t}
              style={{
                ...s.typeBtn,
                ...(item.type === t ? {
                  borderColor: TYPE_COLORS[t],
                  color: TYPE_COLORS[t],
                  background: TYPE_COLORS[t] + '18',
                } : {}),
              }}
              onClick={() => onTypeChange(t)}
            >
              <span style={{ fontSize: 18, display: 'block', marginBottom: 3 }}>{TYPE_ICON[t]}</span>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Fields */}
      <div style={s.fieldGrid}>
        {fields.map(field => (
          <div key={field} style={field === 'notes' || field === 'title' ? { gridColumn: '1 / -1' } : {}}>
            <label style={s.label}>{FIELD_LABELS[field]}</label>
            {field === 'condition' ? (
              <select
                value={item[field] || ''}
                onChange={e => onChange(field, e.target.value)}
              >
                <option value="">— Select —</option>
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input
                type={field === 'year' || field === 'volume_number' ? 'number' : 'text'}
                value={item[field] || ''}
                onChange={e => onChange(field, e.target.value)}
                placeholder={FIELD_LABELS[field]}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Multi-item review card ───────────────────────────────────────────────────
function DetectedCard({ item, index, total, selected, onToggle, onChange, onTypeChange }) {
  const [expanded, setExpanded] = useState(true)
  const color = TYPE_COLORS[item.type] || 'var(--gold)'
  const confidenceColor = { high: 'var(--green)', medium: 'var(--gold)', low: 'var(--red)' }

  return (
    <div style={{
      ...s.detectedCard,
      borderColor: selected ? color + '55' : 'var(--border)',
      opacity: selected ? 1 : 0.45,
    }}>
      {/* Card header */}
      <div style={s.cardHeader}>
        {/* Checkbox */}
        <button
          style={{ ...s.checkbox, ...(selected ? { background: color, borderColor: color } : {}) }}
          onClick={onToggle}
          aria-label={selected ? 'Deselect item' : 'Select item'}
        >
          {selected && <span style={s.checkmark}>✓</span>}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...s.typePill, color, background: color + '22' }}>
              {TYPE_ICON[item.type]} {item.type?.toUpperCase()}
            </span>
            {item.confidence && (
              <span style={{ ...s.confPill, color: confidenceColor[item.confidence] }}>
                {item.confidence} confidence
              </span>
            )}
            {total > 1 && (
              <span style={s.itemCount}>{index + 1} of {total}</span>
            )}
          </div>
          <p style={s.cardTitle}>{item.title || <em style={{ color: 'var(--text3)' }}>Untitled</em>}</p>
          {(item.artist || item.author) && (
            <p style={s.cardCreator}>{item.artist || item.author}</p>
          )}
        </div>

        <button
          style={s.expandBtn}
          onClick={() => setExpanded(v => !v)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Expandable form */}
      {expanded && selected && (
        <div style={s.cardBody}>
          <ItemForm
            item={item}
            onChange={(field, val) => onChange(item._id, field, val)}
            onTypeChange={type => onTypeChange(item._id, type)}
          />
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AddItemPage() {
  const router = useRouter()
  const fileRef = useRef(null)

  const [step, setStep]                 = useState('upload')  // upload | detecting | review | manual
  const [imageFile, setImageFile]       = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageBase64, setImageBase64]   = useState(null)
  const [aiStatus, setAiStatus]         = useState('')
  const [dragOver, setDragOver]         = useState(false)

  // Multi-item state
  const [detectedItems, setDetectedItems] = useState([])
  const [selectedIds, setSelectedIds]     = useState(new Set())
  const [editedItems, setEditedItems]     = useState({})

  // Single manual-entry state
  const [manualType, setManualType] = useState('vinyl')
  const [manualForm, setManualForm] = useState({})

  const [saving, setSaving]             = useState(false)
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 })

  // ── File handling ────────────────────────────────────────────────────────────
  function processFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target.result
      setImagePreview(dataUrl)
      setImageBase64(dataUrl.split(',')[1])
      setStep('detecting')
      runDetection(dataUrl.split(',')[1], file.type)
    }
    reader.readAsDataURL(file)
  }

  // ── Claude detection ─────────────────────────────────────────────────────────
  async function runDetection(base64, mimeType) {
    setAiStatus('Scanning image for media items...')
    try {
      const res = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      const items = data.items || []
      setDetectedItems(items)
      setSelectedIds(new Set(items.map(i => i._id)))

      const edits = {}
      items.forEach(item => {
        edits[item._id] = {
          type:          item.type || 'vinyl',
          title:         item.title || '',
          artist:        item.artist || '',
          album:         item.album || '',
          author:        item.author || '',
          publisher:     item.publisher || '',
          year:          item.year || '',
          genre:         item.genre || '',
          volume_number: item.volume || '',
          condition:     '',
          notes:         '',
          confidence:    item.confidence,
          _id:           item._id,
        }
      })
      setEditedItems(edits)
      setAiStatus(`Found ${items.length} item${items.length !== 1 ? 's' : ''}`)
      setTimeout(() => setStep('review'), 400)
    } catch (err) {
      setAiStatus(err?.message || 'Detection failed — fill in manually')
      setDetectedItems([])
      setTimeout(() => setStep('review'), 1000)
    }
  }

  // ── Item editing helpers ─────────────────────────────────────────────────────
  function updateItem(id, field, val) {
    setEditedItems(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }))
  }

  function updateItemType(id, type) {
    setEditedItems(prev => ({ ...prev, [id]: { ...prev[id], type } }))
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll()   { setSelectedIds(new Set(detectedItems.map(i => i._id))) }
  function deselectAll() { setSelectedIds(new Set()) }

  // ── Upload cover image (shared across all items in the photo) ────────────────
  async function uploadCover(userId) {
    if (!imageFile) return null
    const ext = imageFile.name.split('.').pop() || 'jpg'
    const path = `${userId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('covers')
      .upload(path, imageFile, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('covers').getPublicUrl(path)
    return data.publicUrl
  }

  // ── Save all selected items ──────────────────────────────────────────────────
  async function saveSelected() {
    const toSave = detectedItems
      .filter(i => selectedIds.has(i._id))
      .map(i => editedItems[i._id] || i)

    if (!toSave.length) return
    setSaving(true)
    setSaveProgress({ done: 0, total: toSave.length })

    const { data: { user } } = await supabase.auth.getUser()
    const cover_url = await uploadCover(user.id)

    for (const item of toSave) {
      let enriched = {}
      if (item.title) {
        try {
          const res = await fetch('/api/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: item.type, title: item.title, artist: item.artist, author: item.author }),
          })
          enriched = await res.json()
        } catch {}
      }

      await supabase.from('items').insert({
        user_id:       user.id,
        type:          item.type,
        cover_url:     cover_url || enriched.cover_url || null,
        title:         item.title || enriched.title || '',
        artist:        item.artist || enriched.artist || null,
        album:         item.album  || enriched.album  || null,
        author:        item.author || enriched.author || null,
        publisher:     item.publisher || enriched.publisher || null,
        year:          item.year ? parseInt(item.year) : (enriched.year ? parseInt(enriched.year) : null),
        genre:         item.genre || enriched.genre || null,
        volume_number: item.volume_number ? parseInt(item.volume_number) : null,
        condition:     item.condition || null,
        notes:         item.notes || null,
      })

      setSaveProgress(prev => ({ ...prev, done: prev.done + 1 }))
    }

    setSaving(false)
    router.push('/')
  }

  // ── Save single manual item ──────────────────────────────────────────────────
  async function saveManual() {
    if (!manualForm.title) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    let enriched = {}
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: manualType, title: manualForm.title, artist: manualForm.artist, author: manualForm.author }),
      })
      enriched = await res.json()
    } catch {}

    await supabase.from('items').insert({
      user_id:       user.id,
      type:          manualType,
      title:         manualForm.title || '',
      artist:        manualForm.artist || null,
      album:         manualForm.album || null,
      author:        manualForm.author || null,
      publisher:     manualForm.publisher || null,
      year:          manualForm.year ? parseInt(manualForm.year) : null,
      genre:         manualForm.genre || enriched.genre || null,
      volume_number: manualForm.volume_number ? parseInt(manualForm.volume_number) : null,
      condition:     manualForm.condition || null,
      notes:         manualForm.notes || null,
    })

    setSaving(false)
    router.push('/')
  }

  const selectedCount = selectedIds.size

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.inner}>

        {/* Page header */}
        <div style={s.pageHead}>
          <button style={s.backBtn} onClick={() => router.push('/')}>← Back</button>
          <h1 style={s.pageTitle}>Add to Collection</h1>
        </div>

        {/* ── STEP: Upload ──────────────────────────────────────────────────── */}
        {step === 'upload' && (
          <>
            <div
              style={{ ...s.dropZone, ...(dragOver ? s.dropZoneActive : {}) }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files[0]) }}
            >
              <span style={s.dropIcon}>⊕</span>
              <p style={s.dropTitle}>Drop a photo or click to browse</p>
              <p style={s.dropSub}>
                Works with single items or whole shelves — Claude will detect and list everything visible
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => processFile(e.target.files[0])}
              />
            </div>

            <div style={s.exampleRow}>
              {['Single record', 'Stack of manga', 'Mixed shelf'].map(label => (
                <div key={label} style={s.exampleChip}>
                  <span style={s.exampleDot} />
                  {label}
                </div>
              ))}
            </div>

            <div style={s.orRow}>
              <span style={s.orLine} /><span style={s.orText}>or</span><span style={s.orLine} />
            </div>
            <button style={s.manualBtn} onClick={() => { setStep('manual'); setManualForm({}) }}>
              Add manually without a photo
            </button>
          </>
        )}

        {/* ── STEP: Detecting ───────────────────────────────────────────────── */}
        {step === 'detecting' && (
          <div style={s.detectingWrap}>
            {imagePreview && (
              <img src={imagePreview} alt="Uploaded image" style={s.detectPreview} />
            )}
            <div style={s.aiStatusBox}>
              <span style={s.aiDotPulse} />
              <div>
                <p style={s.aiStatusTitle}>Claude is scanning your image</p>
                <p style={s.aiStatusSub}>{aiStatus}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Review ──────────────────────────────────────────────────── */}
        {step === 'review' && (
          <>
            {/* Source image thumbnail + summary */}
            <div style={s.reviewHeader}>
              {imagePreview && (
                <img src={imagePreview} alt="Source" style={s.reviewThumb} />
              )}
              <div style={{ flex: 1 }}>
                <div style={s.reviewSummaryRow}>
                  <span style={s.reviewFound}>
                    {detectedItems.length > 0
                      ? `${detectedItems.length} item${detectedItems.length !== 1 ? 's' : ''} detected`
                      : 'No items detected'}
                  </span>
                  {detectedItems.length > 1 && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={s.selectAllBtn} onClick={selectAll}>All</button>
                      <button style={s.selectAllBtn} onClick={deselectAll}>None</button>
                    </div>
                  )}
                </div>
                <p style={s.reviewSub}>
                  {detectedItems.length > 0
                    ? 'Review each item — edit fields, change type, or uncheck to skip.'
                    : "Claude couldn't identify any items. Add one manually below."}
                </p>
              </div>
            </div>

            {/* Detected item cards */}
            {detectedItems.length > 0 && (
              <div style={s.cardsWrap}>
                {detectedItems.map((item, idx) => (
                  <DetectedCard
                    key={item._id}
                    item={editedItems[item._id] || item}
                    index={idx}
                    total={detectedItems.length}
                    selected={selectedIds.has(item._id)}
                    onToggle={() => toggleSelect(item._id)}
                    onChange={updateItem}
                    onTypeChange={updateItemType}
                  />
                ))}
              </div>
            )}

            {/* Add another manually */}
            <button style={s.addMoreBtn} onClick={() => setStep('manual')}>
              + Add another item manually
            </button>

            {/* Save bar */}
            {detectedItems.length > 0 && (
              <div style={s.saveBar}>
                {saving ? (
                  <div style={s.saveProgress}>
                    <div
                      style={{
                        ...s.saveProgressFill,
                        width: `${saveProgress.total ? (saveProgress.done / saveProgress.total) * 100 : 0}%`,
                      }}
                    />
                    <span style={s.saveProgressLabel}>
                      Saving {saveProgress.done} / {saveProgress.total}...
                    </span>
                  </div>
                ) : (
                  <button
                    style={{ ...s.saveBtn, ...(selectedCount === 0 ? s.saveBtnDisabled : {}) }}
                    onClick={saveSelected}
                    disabled={selectedCount === 0}
                  >
                    Save {selectedCount} item{selectedCount !== 1 ? 's' : ''} to Collection →
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* ── STEP: Manual ──────────────────────────────────────────────────── */}
        {step === 'manual' && (
          <>
            <div style={s.manualHeader}>
              <button style={s.backBtn} onClick={() => setStep(detectedItems.length ? 'review' : 'upload')}>
                ← {detectedItems.length ? 'Back to detected items' : 'Back'}
              </button>
              <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
                Add a single item manually
              </p>
            </div>
            <ItemForm
              item={{ type: manualType, ...manualForm }}
              onChange={(field, val) => setManualForm(f => ({ ...f, [field]: val }))}
              onTypeChange={t => { setManualType(t); setManualForm({}) }}
            />
            <button
              style={{ ...s.saveBtn, marginTop: 24, ...(!manualForm.title ? s.saveBtnDisabled : {}) }}
              onClick={saveManual}
              disabled={saving || !manualForm.title}
            >
              {saving ? 'Saving...' : 'Save to Collection →'}
            </button>
          </>
        )}

      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page: { minHeight: '100vh', background: 'var(--bg)', padding: '40px 20px' },
  inner: { maxWidth: 560, margin: '0 auto' },
  pageHead: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 },
  backBtn: {
    background: 'none', border: 'none', color: 'var(--text3)',
    fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: 'var(--font)',
  },
  pageTitle: { fontSize: 20, fontWeight: 700 },

  dropZone: {
    border: '1.5px dashed var(--border2)', borderRadius: 'var(--radius-lg)',
    padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
    transition: 'all 0.2s', background: 'var(--bg2)',
  },
  dropZoneActive: { borderColor: 'var(--gold-border)', background: 'var(--gold-dim)' },
  dropIcon: { fontSize: 40, color: 'var(--text3)', display: 'block', marginBottom: 12 },
  dropTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 },
  dropSub: { fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' },

  exampleRow: { display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 },
  exampleChip: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' },
  exampleDot: { width: 4, height: 4, borderRadius: '50%', background: 'var(--text3)', flexShrink: 0 },

  orRow: { display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' },
  orLine: { flex: 1, height: 1, background: 'var(--border)' },
  orText: { fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.08em' },
  manualBtn: {
    width: '100%', padding: 10, background: 'transparent',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    color: 'var(--text3)', fontSize: 13, cursor: 'pointer',
    fontFamily: 'var(--font)', transition: 'all 0.15s',
  },

  detectingWrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  detectPreview: {
    width: '100%', maxHeight: 260, objectFit: 'contain',
    borderRadius: 'var(--radius-lg)', background: 'var(--bg3)',
  },
  aiStatusBox: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
  },
  aiDotPulse: {
    width: 10, height: 10, borderRadius: '50%', background: 'var(--gold)',
    flexShrink: 0, boxShadow: '0 0 0 3px rgba(200,168,75,0.2)',
  },
  aiStatusTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 },
  aiStatusSub: { fontSize: 11, color: 'var(--text3)' },

  reviewHeader: {
    display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20,
    padding: 14, background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
  },
  reviewThumb: {
    width: 72, height: 72, borderRadius: 'var(--radius)',
    objectFit: 'cover', flexShrink: 0, background: 'var(--bg3)',
  },
  reviewSummaryRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  reviewFound: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  reviewSub: { fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 },
  selectAllBtn: {
    padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border)',
    background: 'transparent', color: 'var(--text3)', fontSize: 11,
    fontFamily: 'var(--mono)', cursor: 'pointer', letterSpacing: '0.06em',
  },

  cardsWrap: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 },

  detectedCard: {
    border: '1px solid', borderRadius: 'var(--radius-lg)',
    background: 'var(--bg2)', overflow: 'hidden', transition: 'border-color 0.2s, opacity 0.2s',
  },
  cardHeader: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '14px 14px 12px', cursor: 'pointer',
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 5, border: '1.5px solid var(--border2)',
    background: 'transparent', cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginTop: 2, transition: 'all 0.15s',
  },
  checkmark: { fontSize: 13, color: '#fff', lineHeight: 1 },
  typePill: {
    fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em',
    padding: '2px 7px', borderRadius: 3,
  },
  confPill: { fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.06em' },
  itemCount: { fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' },
  cardTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 4, lineHeight: 1.3 },
  cardCreator: { fontSize: 12, color: 'var(--text3)', marginTop: 2 },
  expandBtn: {
    background: 'none', border: 'none', color: 'var(--text3)',
    fontSize: 10, cursor: 'pointer', padding: 4, flexShrink: 0, marginTop: 4,
  },
  cardBody: {
    borderTop: '1px solid var(--border)', padding: '14px 14px 16px',
    background: 'var(--bg3)',
  },

  addMoreBtn: {
    width: '100%', padding: 10, background: 'transparent',
    border: '1px dashed var(--border2)', borderRadius: 'var(--radius)',
    color: 'var(--text3)', fontSize: 13, cursor: 'pointer',
    fontFamily: 'var(--font)', marginBottom: 16, transition: 'all 0.15s',
  },

  saveBar: { position: 'sticky', bottom: 0, paddingTop: 8 },
  saveProgress: {
    position: 'relative', height: 44, background: 'var(--bg3)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  saveProgressFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    background: 'var(--gold-dim)', transition: 'width 0.3s ease',
  },
  saveProgressLabel: {
    position: 'relative', fontSize: 13, fontFamily: 'var(--mono)',
    color: 'var(--gold)', letterSpacing: '0.06em',
  },
  saveBtn: {
    display: 'block', width: '100%', padding: 13,
    background: 'var(--gold)', color: '#1a1000', border: 'none',
    borderRadius: 'var(--radius)', fontWeight: 700, fontSize: 14,
    cursor: 'pointer', fontFamily: 'var(--font)', letterSpacing: '0.02em',
  },
  saveBtnDisabled: { opacity: 0.35, cursor: 'not-allowed' },

  manualHeader: { marginBottom: 20 },

  // ItemForm styles
  itemForm: {},
  label: {
    display: 'block', fontFamily: 'var(--mono)', fontSize: 10,
    color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6,
  },
  typeGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 },
  typeBtn: {
    padding: '10px 6px', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
    background: 'transparent', color: 'var(--text3)', fontSize: 11, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s', textAlign: 'center',
  },
  fieldGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 10px', marginTop: 2,
  },
}
