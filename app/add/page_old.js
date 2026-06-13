'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TYPE_FIELDS, FIELD_LABELS, CONDITIONS, TYPE_COLORS } from '@/lib/constants'

const STEPS = ['upload', 'detecting', 'confirm', 'manual']

export default function AddItemPage() {
  const router = useRouter()
  const fileRef = useRef(null)
  const [step, setStep] = useState('upload')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageBase64, setImageBase64] = useState(null)
  const [detectedType, setDetectedType] = useState('vinyl')
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [aiStatus, setAiStatus] = useState('')
  const [dragOver, setDragOver] = useState(false)

  function update(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

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

  async function runDetection(base64, mimeType) {
    setAiStatus('Analyzing image...')
    try {
      const res = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setDetectedType(data.type || 'vinyl')
      setForm({
        title:         data.title || '',
        artist:        data.artist || '',
        album:         data.album || '',
        author:        data.author || '',
        publisher:     data.publisher || '',
        year:          data.year || '',
        genre:         data.genre || '',
        volume_number: data.volume || '',
      })
      setAiStatus('Detection complete')
      setTimeout(() => setStep('confirm'), 400)
    } catch (err) {
      setAiStatus(err?.message || 'Detection failed — fill in manually')
      setForm({})
      setTimeout(() => setStep('confirm'), 1000)
    }
  }

  async function saveItem() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    let cover_url = null

    // Upload cover image if present
    if (imageFile) {
      const ext = imageFile.name.split('.').pop() || 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('covers')
        .upload(path, imageFile, { upsert: true })

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('covers').getPublicUrl(path)
        cover_url = urlData.publicUrl
      }
    }

    // Optionally enrich from external APIs
    let enriched = {}
    if (form.title) {
      try {
        const res = await fetch('/api/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: detectedType, title: form.title, artist: form.artist, author: form.author }),
        })
        enriched = await res.json()
      } catch {}
    }

    const { error } = await supabase.from('items').insert({
      user_id: user.id,
      type: detectedType,
      cover_url,
      title:        form.title || enriched.title || '',
      artist:       form.artist || enriched.artist || '',
      album:        form.album || enriched.album || '',
      author:       form.author || enriched.author || '',
      publisher:    form.publisher || enriched.publisher || '',
      year:         form.year ? parseInt(form.year) : (enriched.year ? parseInt(enriched.year) : null),
      genre:        form.genre || enriched.genre || '',
      volume_number:form.volume_number ? parseInt(form.volume_number) : null,
      condition:    form.condition || '',
      notes:        form.notes || '',
    })

    setSaving(false)
    if (!error) router.push('/')
    else alert('Error saving item: ' + error.message)
  }

  const fields = TYPE_FIELDS[detectedType] || []

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <div style={s.pageHead}>
          <button style={s.backBtn} onClick={() => router.push('/')}>← Back</button>
          <h1 style={s.pageTitle}>Add to Collection</h1>
        </div>

        {/* STEP: Upload */}
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
              <p style={s.dropSub}>JPG, PNG, WEBP — Claude will detect the media type automatically</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => processFile(e.target.files[0])}
              />
            </div>
            <div style={s.orRow}>
              <span style={s.orLine} /><span style={s.orText}>or</span><span style={s.orLine} />
            </div>
            <button style={s.manualBtn} onClick={() => { setStep('manual'); setForm({}) }}>
              Add manually without a photo
            </button>
          </>
        )}

        {/* STEP: Detecting */}
        {step === 'detecting' && (
          <div style={s.detectingWrap}>
            {imagePreview && <img src={imagePreview} alt="Upload preview" style={s.detectPreview} />}
            <div style={s.aiStatus}>
              <span style={s.aiDot} />
              <span style={s.aiStatusText}>{aiStatus}</span>
            </div>
          </div>
        )}

        {/* STEP: Confirm (after AI detection) */}
        {(step === 'confirm' || step === 'manual') && (
          <>
            {imagePreview && step === 'confirm' && (
              <div style={s.confirmPreview}>
                <img src={imagePreview} alt="Upload preview" style={s.confirmImg} />
                <div style={s.confirmAiNote}>
                  <span style={{ ...s.aiDot, background: 'var(--green)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                    Claude detected this item — confirm or adjust below
                  </span>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={s.label}>Media Type</label>
              <div style={s.typeGrid}>
                {['vinyl', 'cd', 'comic', 'manga'].map(t => (
                  <button
                    key={t}
                    style={{
                      ...s.typeBtn,
                      ...(detectedType === t ? { ...s.typeBtnActive, borderColor: TYPE_COLORS[t], color: TYPE_COLORS[t], background: TYPE_COLORS[t] + '18' } : {}),
                    }}
                    onClick={() => setDetectedType(t)}
                  >
                    <span style={{ fontSize: 20, display: 'block', marginBottom: 4 }}>
                      {t === 'vinyl' ? '⦿' : t === 'cd' ? '◎' : t === 'comic' ? '▣' : '◈'}
                    </span>
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

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

            <button
              style={{ ...s.saveBtn, ...(saving || !form.title ? s.saveBtnDisabled : {}) }}
              onClick={saveItem}
              disabled={saving || !form.title}
            >
              {saving ? 'Saving...' : 'Save to Collection →'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    padding: '40px 20px',
  },
  inner: {
    maxWidth: 500,
    margin: '0 auto',
  },
  pageHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 32,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text3)',
    fontSize: 14,
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'var(--font)',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: 700,
  },
  dropZone: {
    border: '1.5px dashed var(--border2)',
    borderRadius: 'var(--radius-lg)',
    padding: '48px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: 'var(--bg2)',
  },
  dropZoneActive: {
    borderColor: 'var(--gold-border)',
    background: 'var(--gold-dim)',
  },
  dropIcon: {
    fontSize: 40,
    color: 'var(--text3)',
    display: 'block',
    marginBottom: 12,
  },
  dropTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text2)',
    marginBottom: 6,
  },
  dropSub: {
    fontSize: 12,
    color: 'var(--text3)',
    lineHeight: 1.5,
  },
  orRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '20px 0',
  },
  orLine: {
    flex: 1,
    height: 1,
    background: 'var(--border)',
  },
  orText: {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--text3)',
    letterSpacing: '0.08em',
  },
  manualBtn: {
    width: '100%',
    padding: '10px',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text3)',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'all 0.15s',
  },
  detectingWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  detectPreview: {
    width: '100%',
    maxHeight: 220,
    objectFit: 'contain',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--bg3)',
  },
  aiStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 14px',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
  },
  aiDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--gold)',
    flexShrink: 0,
    animation: 'pulse 1.5s infinite',
  },
  aiStatusText: {
    fontSize: 13,
    color: 'var(--text2)',
  },
  confirmPreview: {
    display: 'flex',
    gap: 14,
    alignItems: 'flex-start',
    marginBottom: 24,
    padding: 14,
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
  },
  confirmImg: {
    width: 72,
    height: 72,
    borderRadius: 'var(--radius)',
    objectFit: 'cover',
    flexShrink: 0,
  },
  confirmAiNote: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  label: {
    display: 'block',
    fontFamily: 'var(--mono)',
    fontSize: 10,
    color: 'var(--text3)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  typeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4,1fr)',
    gap: 8,
  },
  typeBtn: {
    padding: '10px 6px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text3)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'all 0.15s',
    textAlign: 'center',
  },
  typeBtnActive: {},
  formFields: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  formGroup: {},
  saveBtn: {
    width: '100%',
    marginTop: 24,
    padding: '12px',
    background: 'var(--gold)',
    color: '#1a1000',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    letterSpacing: '0.02em',
  },
  saveBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
}
