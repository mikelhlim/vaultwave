'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TYPE_FIELDS, FIELD_LABELS, CONDITIONS, TYPE_COLORS } from '@/lib/constants'

export default function EditItemPage() {
  const { id } = useParams()
  const router = useRouter()
  const [item, setItem] = useState(null)
  const [form, setForm] = useState({})
  const [type, setType] = useState('vinyl')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

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
      }
      setLoading(false)
    })
  }, [id])

  function update(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('items').update({
      type,
      title:         form.title,
      artist:        form.artist || null,
      album:         form.album || null,
      author:        form.author || null,
      publisher:     form.publisher || null,
      year:          form.year ? parseInt(form.year) : null,
      genre:         form.genre || null,
      volume_number: form.volume_number ? parseInt(form.volume_number) : null,
      condition:     form.condition || null,
      notes:         form.notes || null,
      updated_at:    new Date().toISOString(),
    }).eq('id', id)
    setSaving(false)
    if (!error) router.push('/')
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
        <button style={{ marginTop: 12, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => router.push('/')}>← Back</button>
      </div>
    )
  }

  const fields = TYPE_FIELDS[type] || []

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <div style={s.pageHead}>
          <button style={s.backBtn} onClick={() => router.push('/')}>← Back</button>
          <div>
            <h1 style={s.pageTitle}>Edit Item</h1>
            <p style={s.pageSub}>{item.title}</p>
          </div>
        </div>

        {/* Cover preview */}
        {item.cover_url && (
          <div style={s.coverPreview}>
            <img src={item.cover_url} alt={item.title} style={s.coverImg} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, fontFamily: 'var(--mono)', letterSpacing: '0.08em' }}>CURRENT COVER</p>
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>Cover image from upload. To change it, delete this item and re-add with a new photo.</p>
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
          <button style={s.cancelBtn} onClick={() => router.push('/')}>Cancel</button>
          <button
            style={{ ...s.saveBtn, ...(saving || !form.title ? s.saveBtnDisabled : {}) }}
            onClick={save}
            disabled={saving || !form.title}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
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
  pageTitle: { fontSize: 20, fontWeight: 700 },
  pageSub: { fontSize: 12, color: 'var(--text3)', marginTop: 3 },
  coverPreview: {
    display: 'flex', gap: 14, alignItems: 'center', marginBottom: 24,
    padding: 14, background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
  },
  coverImg: { width: 64, height: 64, borderRadius: 'var(--radius)', objectFit: 'cover', flexShrink: 0 },
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
    flex: 2, padding: 12, background: 'var(--gold)', color: '#1a1000',
    border: 'none', borderRadius: 'var(--radius)', fontWeight: 700,
    fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font)', letterSpacing: '0.02em',
  },
  saveBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
}
