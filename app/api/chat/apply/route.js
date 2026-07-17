import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'

// Every write everywhere else in the app (Edit page, delete buttons) is
// admin-only — the chatbot doesn't get a side door around that. A viewer
// can still see a proposal card, just not confirm it.
const EDITABLE_FIELDS = new Set([
  'title', 'artist', 'album', 'author', 'publisher', 'year', 'genre',
  'volume_number', 'condition', 'notes', 'wishlist', 'lent_to',
])

function sanitizeFields(fields) {
  if (!fields || typeof fields !== 'object') return {}
  const out = {}
  for (const [key, value] of Object.entries(fields)) {
    if (!EDITABLE_FIELDS.has(key)) continue
    if (key === 'year' || key === 'volume_number') {
      out[key] = value === '' || value == null ? null : parseInt(value, 10)
      if (Number.isNaN(out[key])) delete out[key]
    } else if (key === 'wishlist') {
      out[key] = !!value
    } else {
      out[key] = value === '' ? null : value
    }
  }
  return out
}

export async function POST(request) {
  try {
    const auth = await requireAdmin(request)
    if (!auth) {
      return NextResponse.json({ error: 'Only admins can apply changes.' }, { status: 403 })
    }
    const { admin } = auth

    const { changes } = await request.json()
    if (!Array.isArray(changes) || !changes.length) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
    }

    const results = []
    for (const change of changes) {
      const { item_id, label, action } = change || {}
      if (!item_id || (action !== 'update' && action !== 'delete')) {
        results.push({ item_id, label, ok: false, error: 'Malformed change' })
        continue
      }

      const { data: existing } = await admin.from('items').select('id').eq('id', item_id).single()
      if (!existing) {
        results.push({ item_id, label, ok: false, error: 'Item no longer exists' })
        continue
      }

      if (action === 'delete') {
        const { error } = await admin.from('items').delete().eq('id', item_id)
        results.push({ item_id, label, ok: !error, error: error?.message })
        continue
      }

      const fields = sanitizeFields(change.fields)
      if (Object.keys(fields).length === 0) {
        results.push({ item_id, label, ok: false, error: 'No editable fields in this change' })
        continue
      }
      const { error } = await admin.from('items').update(fields).eq('id', item_id)
      results.push({ item_id, label, ok: !error, error: error?.message })
    }

    return NextResponse.json({ results })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
