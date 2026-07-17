import { NextResponse } from 'next/server'

// Same retry shape as /api/enrich — Jikan is rate-limited (~3 req/sec, 60/min)
// and occasionally has upstream MAL outages; a transient failure shouldn't
// blank the whole feed.
async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res
    try {
      res = await fetch(url, options)
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise(r => setTimeout(r, 300 * 2 ** attempt))
      continue
    }

    if (res.ok || attempt === retries) return res
    if (res.status !== 429 && res.status < 500) return res

    const retryAfter = parseFloat(res.headers.get('retry-after'))
    const delay = !Number.isNaN(retryAfter) ? retryAfter * 1000 : 300 * 2 ** attempt
    await new Promise(r => setTimeout(r, delay))
  }
}

async function fetchNewsForId(malId) {
  try {
    const res = await fetchWithRetry(`https://api.jikan.moe/v4/manga/${malId}/news`, {
      next: { revalidate: 21600 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.data || []).map(n => ({
      mal_id: malId,
      title: n.title,
      url: n.url,
      date: n.date,
      excerpt: n.excerpt || '',
      image_url: n.images?.jpg?.image_url || null,
    }))
  } catch {
    return []
  }
}

// Collection-scoped — news for manga the signed-in user actually owns. The
// client fetches its own items.external_id_jikan list first (normal
// authenticated read) and posts just the id array here.
export async function POST(request) {
  try {
    const { malIds } = await request.json()
    const ids = Array.from(new Set((malIds || []).filter(Boolean))).slice(0, 30)
    if (!ids.length) return NextResponse.json({ items: [] })

    const results = []
    for (let i = 0; i < ids.length; i += 3) {
      const batch = ids.slice(i, i + 3)
      const batchResults = await Promise.all(batch.map(fetchNewsForId))
      results.push(...batchResults.flat())
      if (i + 3 < ids.length) await new Promise(r => setTimeout(r, 400))
    }

    results.sort((a, b) => new Date(b.date) - new Date(a.date))
    return NextResponse.json({ items: results.slice(0, 20) })
  } catch {
    return NextResponse.json({ items: [] })
  }
}

// Unscoped — manga currently publishing generally, not filtered to the
// user's collection or to specific publishers (Jikan has no publisher filter).
export async function GET() {
  try {
    const url = 'https://api.jikan.moe/v4/manga?status=publishing&order_by=start_date&sort=desc&limit=20'
    const res = await fetchWithRetry(url, { next: { revalidate: 21600 } })
    if (!res.ok) return NextResponse.json({ items: [] })
    const data = await res.json()

    const items = (data.data || []).map(m => ({
      mal_id:  m.mal_id ? String(m.mal_id) : null,
      title:   m.title_english || m.title,
      url:     m.url,
      date:    m.published?.from || null,
      image_url: m.images?.jpg?.image_url || null,
      authors: (m.authors || []).map(a => a.name),
    }))
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
