'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TYPE_FIELDS, FIELD_LABELS, CONDITIONS, TYPE_COLORS, nameFieldFor } from '@/lib/constants'
import { findPossibleDuplicate } from '@/lib/matching'

const TYPE_ICON = { vinyl: '⦿', cd: '◎', comic: '▣', manga: '◈' }

// ─── Single item inline form ──────────────────────────────────────────────────
function ItemForm({ item, onChange, onTypeChange, existingItems }) {
  const fields = TYPE_FIELDS[item.type] || []
  const dup = existingItems?.length ? findPossibleDuplicate(item, existingItems) : null
  const isMusic = item.type === 'vinyl' || item.type === 'cd'
  const [finding, setFinding] = useState(false)
  const [findMessage, setFindMessage] = useState(null)

  async function findCover() {
    const searchName = item[nameFieldFor(item.type)]
    if (!searchName) return
    setFinding(true)
    setFindMessage(null)
    onChange('coverCandidates', null)
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: item.type, title: searchName, artist: item.artist, author: item.author, volume: item.volume_number }),
      })
      const enriched = await res.json()

      if (enriched.cover_url) onChange('enrichedCoverUrl', enriched.cover_url)
      if (enriched.tracklist) onChange('enrichedTracklist', enriched.tracklist)
      if (enriched.mal_id) onChange('enrichedMalId', enriched.mal_id)

      const hasCandidates = enriched.cover_candidates?.length > 1
      if (hasCandidates) onChange('coverCandidates', enriched.cover_candidates)

      // Fill in any currently-empty fields — never overwrite something
      // already there, since that may be a deliberate correction. `album`
      // only applies to vinyl/cd (Discogs returns the matched album as
      // `title`) — comics/manga have no album field, so writing it there
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
      for (const [key, value] of Object.entries(fillable)) {
        if (!item[key] && value) onChange(key, String(value))
      }

      if (hasCandidates) setFindMessage({ type: 'success', text: `Found ${enriched.cover_candidates.length} possible pressings — pick one below.` })
      else if (enriched.cover_url) setFindMessage({ type: 'success', text: 'Found a cover.' })
      else setFindMessage({ type: 'error', text: 'No matching cover found.' })
    } catch {
      setFindMessage({ type: 'error', text: 'Could not reach the enrichment service.' })
    } finally {
      setFinding(false)
    }
  }

  async function pickCoverCandidate(candidate) {
    onChange('enrichedCoverUrl', candidate.cover_url || '')
    onChange('coverCandidates', null)
    setFinding(true)
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: item.type, title: item[nameFieldFor(item.type)], artist: item.artist, discogsReleaseId: candidate.id }),
      })
      const detail = await res.json()
      if (detail.cover_url) onChange('enrichedCoverUrl', detail.cover_url)
      if (detail.tracklist) onChange('enrichedTracklist', detail.tracklist)
      setFindMessage({ type: 'success', text: 'Cover selected.' })
    } catch {
      setFindMessage({ type: 'error', text: "Couldn't load that pressing's details, but the cover was still applied." })
    } finally {
      setFinding(false)
    }
  }

  // Auto-load a cover as soon as a name is already known (detected items
  // arrive from Claude Vision fully named) — "Find Cover" stays for
  // re-searching after an edit, or for browsing other pressings/candidates.
  // Guarded so a collapse/reselect remount doesn't repeat a search that
  // already succeeded — enrichedCoverUrl lives in the parent's state, so it
  // survives this component unmounting and remounting.
  const autoSearchedRef = useRef(false)
  useEffect(() => {
    if (autoSearchedRef.current) return
    autoSearchedRef.current = true
    if (item[nameFieldFor(item.type)] && !item.enrichedCoverUrl) findCover()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          <div key={field} style={field === 'notes' || field === 'title' || field === 'album' ? { gridColumn: '1 / -1' } : {}}>
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

      {/* Cover lookup */}
      <div style={s.coverFindWrap}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {item.enrichedCoverUrl ? (
            <img src={item.enrichedCoverUrl} alt="" style={s.coverFindThumb} />
          ) : (
            <div style={s.coverFindThumbPlaceholder} />
          )}
          <button
            style={{ ...s.findCoverBtn, ...(finding || !item[nameFieldFor(item.type)] ? s.regenBtnDisabled : {}) }}
            onClick={findCover}
            disabled={finding || !item[nameFieldFor(item.type)]}
          >
            {finding ? 'Searching...' : item.enrichedCoverUrl ? '↻ Find Cover Again' : '⌕ Find Cover'}
          </button>
        </div>
        {findMessage && (
          <p style={{ ...s.regenMsg, color: findMessage.type === 'error' ? 'var(--red)' : 'var(--green)' }}>
            {findMessage.text}
          </p>
        )}
        {item.coverCandidates && (
          <div style={s.candidateGrid}>
            {item.coverCandidates.map(c => (
              <button
                key={c.id}
                style={{ ...s.candidateBtn, ...(finding ? s.regenBtnDisabled : {}) }}
                onClick={() => pickCoverCandidate(c)}
                disabled={finding}
              >
                {c.cover_url ? (
                  <img src={c.cover_url} alt={c.album} style={s.candidateImg} />
                ) : (
                  <div style={s.coverFindThumbPlaceholder} />
                )}
                <span style={s.candidateMeta}>{c.year || '—'}{c.format ? ` · ${c.format}` : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Duplicate/variant banner */}
      {dup && (
        <div style={s.dupBanner}>
          {dup.match.cover_url ? (
            <img src={dup.match.cover_url} alt="" style={s.dupThumb} />
          ) : (
            <div style={s.dupThumbPlaceholder} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={s.dupText}>
              Possible duplicate — <strong>{dup.match[nameFieldFor(dup.match.type)]}</strong>
              {isMusic && dup.match.artist ? ` by ${dup.match.artist}` : ''}
              {dup.match.year ? ` (${dup.match.year})` : ''} is already in your collection.
            </p>
            <label style={s.dupCheckboxRow}>
              <input
                type="checkbox"
                checked={item.variantOf === dup.match.id}
                onChange={e => onChange('variantOf', e.target.checked ? dup.match.id : null)}
              />
              Same {isMusic ? 'album' : 'title'}, different pressing/edition — add as a variant.
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Multi-item review card ───────────────────────────────────────────────────
function DetectedCard({ item, index, total, selected, onToggle, onChange, onTypeChange, existingItems, onSaveOne, saving }) {
  const [expanded, setExpanded] = useState(true)
  const color = TYPE_COLORS[item.type] || 'var(--text3)'
  const confidenceColor = { high: 'var(--green)', medium: 'var(--text2)', low: 'var(--red)' }
  const hasName = !!item[nameFieldFor(item.type)]
  // A duplicate banner the user hasn't acted on (checked "variant" or
  // otherwise) shouldn't let Save through silently — that's exactly how
  // unflagged duplicate rows slipped in before this.
  const dup = existingItems?.length ? findPossibleDuplicate(item, existingItems) : null
  const hasUnresolvedDup = !!dup && item.variantOf !== dup.match.id

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
          <p style={s.cardTitle}>{item[nameFieldFor(item.type)] || <em style={{ color: 'var(--text3)' }}>Untitled</em>}</p>
          {(item.artist || item.author) && (
            <p style={s.cardCreator}>{item.artist || item.author}</p>
          )}
        </div>

        <button
          style={{ ...s.cardSaveBtn, ...(saving || !hasName || hasUnresolvedDup ? s.regenBtnDisabled : {}) }}
          onClick={() => onSaveOne(item._id)}
          disabled={saving || !hasName || hasUnresolvedDup}
          title={hasUnresolvedDup
            ? 'Resolve the possible-duplicate warning below first — check "add as a variant" or edit the fields'
            : 'Save just this item and remove it from the review list'}
        >
          {saving ? '...' : 'Save'}
        </button>

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
            existingItems={existingItems}
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
  const [savingItemId, setSavingItemId]   = useState(null)
  // How many Claude actually found this round — kept separate from
  // detectedItems.length so "list emptied because you saved everything"
  // doesn't get relabeled as "nothing was detected".
  const [detectedCount, setDetectedCount] = useState(0)

  // Existing catalog, fetched once — feeds duplicate/variant detection below.
  const [existingItems, setExistingItems] = useState([])

  // Single manual-entry state
  const [manualType, setManualType] = useState('vinyl')
  const [manualForm, setManualForm] = useState({})

  const [saving, setSaving]             = useState(false)
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 })
  const [sharedCoverUrl, setSharedCoverUrl] = useState(null)
  const [sharedCoverUploaded, setSharedCoverUploaded] = useState(false)

  // ── Access guard — only admins can add items ─────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
      if (profile?.role !== 'admin') router.push('/')
    })
  }, [])

  useEffect(() => {
    supabase.from('items').select('*').then(({ data }) => setExistingItems(data || []))
  }, [])

  // ── File handling ────────────────────────────────────────────────────────────
  async function processFile(file) {
    if (!file) return

    const { isHeic, heicTo } = await import('heic-to')
    // Byte-level check — file.type is unreliable for HEIC across browsers/OSes.
    const looksHeic = file.type === 'image/heic' || file.type === 'image/heif' || /\.hei[cf]$/i.test(file.name)
    const heic = looksHeic || (file.type.startsWith('image/') ? false : await isHeic(file).catch(() => false))
    if (!file.type.startsWith('image/') && !heic) return

    let workingFile = file

    // Claude Vision only accepts JPEG/PNG/GIF/WebP — HEIC (the default format
    // for iPhone photos) has to be converted before it can be detected.
    if (heic) {
      setStep('detecting')
      setAiStatus('Converting HEIC photo...')
      try {
        const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 })
        workingFile = new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' })
      } catch (err) {
        setAiStatus('Could not convert this HEIC photo — try exporting it as JPEG first.')
        setStep('upload')
        return
      }
    }

    setImageFile(workingFile)
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target.result
      setImagePreview(dataUrl)
      setImageBase64(dataUrl.split(',')[1])
      setStep('detecting')
      runDetection(dataUrl.split(',')[1], workingFile.type)
    }
    reader.readAsDataURL(workingFile)
  }

  // Collapses detections that share the same identifying fields (type, name,
  // creator, volume/issue) into one — Claude Vision sometimes returns the
  // same physical spine twice on a crowded shelf photo. Volume/issue is part
  // of the key so genuinely different volumes of the same series never merge.
  // Keeps the higher-confidence detection when two candidates tie on identity.
  function dedupeDetectedItems(items) {
    const rank = { high: 3, medium: 2, low: 1 }
    const byKey = new Map()
    const order = []
    for (const item of items) {
      const name = (item.title || item.album || '').trim().toLowerCase()
      const creator = (item.artist || item.author || '').trim().toLowerCase()
      const volume = (item.volume ?? '').toString().trim()
      const key = `${item.type}|${name}|${creator}|${volume}`
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, item)
        order.push(key)
      } else if ((rank[item.confidence] || 0) > (rank[existing.confidence] || 0)) {
        byKey.set(key, item)
      }
    }
    return order.map(key => byKey.get(key))
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

      const items = dedupeDetectedItems(data.items || [])
      setDetectedItems(items)
      setDetectedCount(items.length)
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

  // Uploaded once per source photo and cached — saving items one at a time
  // via the per-card button would otherwise re-upload the same shelf photo
  // on every click.
  async function getSharedCoverUrl(userId) {
    if (sharedCoverUploaded) return sharedCoverUrl
    const url = await uploadCover(userId)
    setSharedCoverUrl(url)
    setSharedCoverUploaded(true)
    return url
  }

  // Resolves enrichment (or reuses what "Find Cover" already found) and
  // inserts one item. Shared by both the per-card Save button and the bulk
  // "Save N items" button below.
  async function insertDetectedItem(item, user, fallbackCoverUrl) {
    const searchName = item[nameFieldFor(item.type)]
    let enriched = {}
    if (item.enrichedCoverUrl || item.enrichedTracklist) {
      // Already resolved via "Find Cover" during review — reuse it rather
      // than re-searching, which could silently discard the pressing the
      // user picked and replace it with the default top match again.
      enriched = { cover_url: item.enrichedCoverUrl, tracklist: item.enrichedTracklist, mal_id: item.enrichedMalId }
    } else if (searchName) {
      try {
        const res = await fetch('/api/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: item.type, title: searchName, artist: item.artist, author: item.author, volume: item.volume_number }),
        })
        enriched = await res.json()
      } catch {}
    }

    const isMusic = item.type === 'vinyl' || item.type === 'cd'
    const album = isMusic ? (item.album || enriched.album || enriched.title || null) : (item.album || null)
    const title = isMusic ? (album || '') : (item.title || enriched.title || '')

    // Re-check against the confirmed match rather than trusting stale
    // review-time state — if the user kept editing after checking the
    // variant box, a match that no longer holds shouldn't get applied.
    const dup = findPossibleDuplicate(item, existingItems)
    const variantOf = item.variantOf && dup?.match?.id === item.variantOf ? item.variantOf : null

    return supabase.from('items').insert({
      user_id:       user.id,
      type:          item.type,
      cover_url:     enriched.cover_url || fallbackCoverUrl || null,
      title,
      artist:        item.artist || enriched.artist || null,
      album,
      author:        item.author || enriched.author || null,
      publisher:     item.publisher || enriched.publisher || null,
      year:          item.year ? parseInt(item.year) : (enriched.year ? parseInt(enriched.year) : null),
      genre:         item.genre || enriched.genre || null,
      volume_number: item.volume_number ? parseInt(item.volume_number) : null,
      condition:     item.condition || null,
      notes:         item.notes || null,
      external_id_jikan: enriched.mal_id || null,
      tracklist:     enriched.tracklist || null,
      is_variant:    !!variantOf,
      parent_item_id: variantOf,
    })
  }

  // Removes a detected item's card from the review list (already saved, or
  // no longer wanted) without touching the others.
  function dropDetectedItem(id) {
    setDetectedItems(prev => prev.filter(i => i._id !== id))
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
    setEditedItems(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  // ── Save one item, independent of the rest of the batch ──────────────────────
  async function saveOneItem(id) {
    const source = detectedItems.find(i => i._id === id)
    const item = editedItems[id] || source
    if (!item) return
    setSavingItemId(id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const coverUrl = await getSharedCoverUrl(user.id)
      const { error } = await insertDetectedItem(item, user, coverUrl)
      if (error) { alert('Error saving: ' + error.message); return }
      dropDetectedItem(id)
    } finally {
      setSavingItemId(null)
    }
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
    const cover_url = await getSharedCoverUrl(user.id)

    for (const item of toSave) {
      await insertDetectedItem(item, user, cover_url)
      setSaveProgress(prev => ({ ...prev, done: prev.done + 1 }))
    }

    setSaving(false)
    router.push('/collection')
  }

  // ── Save single manual item ──────────────────────────────────────────────────
  async function saveManual() {
    const searchName = manualForm[nameFieldFor(manualType)]
    if (!searchName) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    let enriched = {}
    if (manualForm.enrichedCoverUrl || manualForm.enrichedTracklist) {
      enriched = { cover_url: manualForm.enrichedCoverUrl, tracklist: manualForm.enrichedTracklist, mal_id: manualForm.enrichedMalId }
    } else {
      try {
        const res = await fetch('/api/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: manualType, title: searchName, artist: manualForm.artist, author: manualForm.author, volume: manualForm.volume_number }),
        })
        enriched = await res.json()
      } catch {}
    }

    const isMusic = manualType === 'vinyl' || manualType === 'cd'
    const album = isMusic ? (manualForm.album || enriched.album || enriched.title || null) : (manualForm.album || null)
    const title = isMusic ? (album || '') : (manualForm.title || enriched.title || '')

    const dup = findPossibleDuplicate({ type: manualType, ...manualForm }, existingItems)
    const variantOf = manualForm.variantOf && dup?.match?.id === manualForm.variantOf ? manualForm.variantOf : null

    await supabase.from('items').insert({
      user_id:       user.id,
      type:          manualType,
      cover_url:     enriched.cover_url || null,
      title,
      artist:        manualForm.artist || null,
      album,
      author:        manualForm.author || null,
      publisher:     manualForm.publisher || null,
      year:          manualForm.year ? parseInt(manualForm.year) : null,
      genre:         manualForm.genre || enriched.genre || null,
      volume_number: manualForm.volume_number ? parseInt(manualForm.volume_number) : null,
      condition:     manualForm.condition || null,
      notes:         manualForm.notes || null,
      external_id_jikan: enriched.mal_id || null,
      tracklist:     enriched.tracklist || null,
      is_variant:    !!variantOf,
      parent_item_id: variantOf,
    })

    setSaving(false)
    router.push('/collection')
  }

  const selectedCount = selectedIds.size

  // Same rule as the per-card Save button, applied to the batch: a
  // duplicate warning nobody acted on must not slip through via bulk save
  // either — that's exactly how unflagged duplicate rows got created before.
  const unresolvedDuplicateCount = detectedItems
    .filter(i => selectedIds.has(i._id))
    .map(i => editedItems[i._id] || i)
    .filter(item => {
      const dup = existingItems?.length ? findPossibleDuplicate(item, existingItems) : null
      return !!dup && item.variantOf !== dup.match.id
    }).length

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.inner}>

        {/* Page header */}
        <div style={s.pageHead}>
          <button style={s.backBtn} onClick={() => router.push('/collection')}>← Back</button>
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
                accept="image/*,.heic,.heif"
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
                      : detectedCount > 0
                      ? 'All items saved'
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
                    : detectedCount > 0
                    ? 'Every detected item has been saved to your collection.'
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
                    existingItems={existingItems}
                    onSaveOne={saveOneItem}
                    saving={savingItemId === item._id}
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
                    style={{ ...s.saveBtn, ...(selectedCount === 0 || unresolvedDuplicateCount > 0 ? s.saveBtnDisabled : {}) }}
                    onClick={saveSelected}
                    disabled={selectedCount === 0 || unresolvedDuplicateCount > 0}
                    title={unresolvedDuplicateCount > 0 ? 'Resolve the duplicate warning(s) on flagged cards before saving' : undefined}
                  >
                    {unresolvedDuplicateCount > 0
                      ? `Resolve ${unresolvedDuplicateCount} duplicate warning${unresolvedDuplicateCount !== 1 ? 's' : ''} to save`
                      : `Save ${selectedCount} item${selectedCount !== 1 ? 's' : ''} to Collection →`}
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
              existingItems={existingItems}
            />
            {(() => {
              const manualDup = existingItems?.length
                ? findPossibleDuplicate({ type: manualType, ...manualForm }, existingItems)
                : null
              const manualUnresolvedDup = !!manualDup && manualForm.variantOf !== manualDup.match.id
              const manualDisabled = saving || !manualForm[nameFieldFor(manualType)] || manualUnresolvedDup
              return (
                <button
                  style={{ ...s.saveBtn, marginTop: 24, ...(manualDisabled ? s.saveBtnDisabled : {}) }}
                  onClick={saveManual}
                  disabled={manualDisabled}
                  title={manualUnresolvedDup ? 'Resolve the possible-duplicate warning above first' : undefined}
                >
                  {saving ? 'Saving...' : manualUnresolvedDup ? 'Resolve duplicate warning to save' : 'Save to Collection →'}
                </button>
              )
            })()}
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
  pageTitle: { fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' },

  dropZone: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'var(--border2)', borderRadius: 'var(--radius-lg)',
    padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
    transition: 'all 0.2s', background: 'var(--bg2)',
  },
  dropZoneActive: { borderColor: 'var(--highlight-border)', background: 'var(--highlight)' },
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
    width: 10, height: 10, borderRadius: '50%', background: 'var(--text2)',
    flexShrink: 0, boxShadow: '0 0 0 3px rgba(255,255,255,0.1)',
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
  cardSaveBtn: {
    padding: '5px 12px', background: 'transparent', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius)', color: 'var(--text2)', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0, marginTop: 2, alignSelf: 'flex-start',
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
    background: 'var(--highlight)', transition: 'width 0.3s ease',
  },
  saveProgressLabel: {
    position: 'relative', fontSize: 13, fontFamily: 'var(--mono)',
    color: 'var(--text)', letterSpacing: '0.06em',
  },
  saveBtn: {
    display: 'block', width: '100%', padding: 13,
    background: 'var(--accent)', color: 'var(--on-brand)', border: 'none',
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

  coverFindWrap: { marginTop: 14 },
  coverFindThumb: { width: 40, height: 40, borderRadius: 4, objectFit: 'cover', flexShrink: 0 },
  coverFindThumbPlaceholder: { width: 40, height: 40, borderRadius: 4, background: 'var(--bg3)', flexShrink: 0 },
  findCoverBtn: {
    padding: '6px 12px', background: 'transparent', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 12,
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  regenBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  regenMsg: { fontSize: 12, marginTop: 8, lineHeight: 1.5 },
  candidateGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 8, marginTop: 10,
  },
  candidateBtn: {
    display: 'flex', flexDirection: 'column', gap: 4, padding: 6,
    background: 'transparent', border: '1px solid var(--border2)', borderRadius: 'var(--radius)',
    cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
  },
  candidateImg: { width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 'var(--radius)' },
  candidateMeta: { fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', lineHeight: 1.4 },

  dupBanner: {
    display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14,
    padding: 10, background: 'var(--bg2)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius)',
  },
  dupThumb: { width: 36, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 },
  dupThumbPlaceholder: { width: 36, height: 36, borderRadius: 4, background: 'var(--bg3)', flexShrink: 0 },
  dupText: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 6 },
  dupCheckboxRow: {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
    color: 'var(--text3)', cursor: 'pointer', lineHeight: 1.4,
  },
}
