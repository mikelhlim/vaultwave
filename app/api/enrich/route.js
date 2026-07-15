import { NextResponse } from 'next/server'

// ─── Retry ───────────────────────────────────────────────────────────────────
// Enrichment hits three free/rate-limited third-party APIs; a transient 429
// or network blip shouldn't cost a cover. Retries on rate limiting (honoring
// Retry-After when present) and server/network errors, with backoff.
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
    if (res.status !== 429 && res.status < 500) return res // non-retryable (4xx)

    const retryAfter = parseFloat(res.headers.get('retry-after'))
    const delay = !Number.isNaN(retryAfter) ? retryAfter * 1000 : 300 * 2 ** attempt
    await new Promise(r => setTimeout(r, delay))
  }
}

// ─── Title matching ────────────────────────────────────────────────────────────
// Strips punctuation/spacing so e.g. "Dan Da Dan" and "Dandadan" compare equal.
function normalizeTitle(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

// Dice's coefficient over character bigrams — cheap, dependency-free, and
// good enough to rank near-miss titles without a fuzzy-matching library.
function titleSimilarity(a, b) {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.length < 2 || nb.length < 2) return 0

  const bigrams = str => {
    const counts = new Map()
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.slice(i, i + 2)
      counts.set(bg, (counts.get(bg) || 0) + 1)
    }
    return counts
  }

  const bigramsA = bigrams(na)
  const bigramsB = bigrams(nb)
  let overlap = 0
  for (const [bg, count] of bigramsA) {
    if (bigramsB.has(bg)) overlap += Math.min(count, bigramsB.get(bg))
  }
  return (2 * overlap) / (na.length - 1 + (nb.length - 1))
}

// Picks the best-matching candidate out of a set, or null if nothing is a
// plausible match — returning nothing is better than attaching a wrong cover.
const MATCH_THRESHOLD = 0.6
function bestMatch(query, candidates, getTitles) {
  const normQuery = normalizeTitle(query)
  let best = null
  let bestScore = 0

  for (const candidate of candidates) {
    for (const candidateTitle of getTitles(candidate)) {
      if (!candidateTitle) continue
      if (normalizeTitle(candidateTitle) === normQuery) return candidate
      const score = titleSimilarity(query, candidateTitle)
      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
    }
  }

  return bestScore >= MATCH_THRESHOLD ? best : null
}

// ─── Discogs ─────────────────────────────────────────────────────────────────
async function enrichFromDiscogs(title, artist) {
  try {
    const query = [title, artist].filter(Boolean).join(' ')
    const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&per_page=5`
    const res = await fetchWithRetry(url, {
      headers: {
        Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
        'User-Agent': 'VaultWave/1.0',
      },
    })
    if (!res.ok) return {}
    const data = await res.json()
    const results = data.results || []
    if (!results.length) return {}

    const result = bestMatch(title, results, r => [r.title?.split(' - ')[1], r.title]) || results[0]

    return {
      title:     result.title?.split(' - ')[1] || result.title || title,
      artist:    result.title?.split(' - ')[0] || artist,
      year:      result.year?.toString() || '',
      genre:     result.genre?.[0] || result.style?.[0] || '',
      cover_url: result.cover_image || null,
      label:     result.label?.[0] || '',
      catalog:   result.catno || '',
    }
  } catch {
    return {}
  }
}

// ─── ComicVine ───────────────────────────────────────────────────────────────
async function enrichFromComicVine(title) {
  try {
    const url = `https://comicvine.gamespot.com/api/search/?api_key=${process.env.COMICVINE_API_KEY}&format=json&query=${encodeURIComponent(title)}&resources=issue&limit=5&field_list=name,volume,start_year,publisher,image,description`
    const res = await fetchWithRetry(url, { headers: { 'User-Agent': 'VaultWave/1.0' } })
    if (!res.ok) return {}
    const data = await res.json()
    const results = data.results || []
    if (!results.length) return {}

    const result = bestMatch(title, results, r => [r.name, r.volume?.name]) || results[0]

    return {
      title:     result.name || title,
      publisher: result.volume?.publisher?.name || '',
      year:      result.start_year?.toString() || '',
      cover_url: result.image?.medium_url || null,
    }
  } catch {
    return {}
  }
}

// ─── Google Books ────────────────────────────────────────────────────────────
// Real published English editions (VIZ Media, Kodansha USA, etc.) — far more
// reliable for volume-accurate English cover art than a scanlation tracker
// like MangaDex, since these are actual book listings, not fan-uploaded scans.
function titleContainsVolume(title, volume) {
  if (volume == null || volume === '') return true
  const n = parseInt(volume, 10)
  if (Number.isNaN(n)) return true
  return new RegExp(`\\b0*${n}\\b`).test(title)
}

async function enrichFromGoogleBooks(title, volume) {
  try {
    const query = volume ? `${title} vol ${volume}` : title
    const key = process.env.GOOGLE_BOOKS_API_KEY ? `&key=${process.env.GOOGLE_BOOKS_API_KEY}` : ''
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10&printType=books${key}`
    const res = await fetchWithRetry(url)
    if (!res.ok) return {}
    const data = await res.json()
    const items = data.items || []
    if (!items.length) return {}

    const fullTitle = item => [item.volumeInfo?.title, item.volumeInfo?.subtitle].filter(Boolean).join(' ')

    // English editions whose title/subtitle actually names this volume —
    // if none exist, don't guess; let the caller fall back to MangaDex.
    const englishItems = items.filter(item => item.volumeInfo?.language === 'en')
    const candidates = volume
      ? englishItems.filter(item => titleContainsVolume(fullTitle(item), volume))
      : englishItems

    const result = bestMatch(title, candidates, item => [item.volumeInfo?.title, fullTitle(item)])
    if (!result) return {}

    const info = result.volumeInfo
    const rawCover = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail
    if (!rawCover) return {}
    const cover_url = rawCover.replace(/^http:/, 'https:').replace(/&edge=curl/, '')

    return {
      title:     info.title || title,
      author:    info.authors?.[0] || '',
      publisher: info.publisher || '',
      year:      info.publishedDate ? info.publishedDate.slice(0, 4) : '',
      cover_url,
    }
  } catch {
    return {}
  }
}

// ─── MangaDex ────────────────────────────────────────────────────────────────
// Fetches the cover matched to the specific volume when one is known —
// otherwise every volume of a series would get the same (usually volume 1)
// cover. Priority: exact volume in English > exact volume in any language
// (a right-volume/wrong-language cover beats a wrong-volume English one) >
// nearest English volume > whatever cover the manga record already carries.
async function fetchVolumeCover(mangaId, volumeNumber, fallbackFileName) {
  try {
    const url = `https://api.mangadex.org/cover?manga[]=${mangaId}&limit=100&order[volume]=asc`
    const res = await fetchWithRetry(url, { headers: { 'User-Agent': 'VaultWave/1.0' } })
    if (res.ok) {
      const data = await res.json()
      const covers = data.data || []
      if (covers.length) {
        const target = volumeNumber != null && volumeNumber !== '' ? String(volumeNumber).trim() : null
        const isEn = c => c.attributes?.locale === 'en'
        const atVolume = target ? covers.filter(c => c.attributes?.volume === target) : []

        let chosen =
          atVolume.find(isEn) ||           // exact volume, English
          atVolume[0] ||                   // exact volume, any language
          null

        if (!chosen) {
          // No cover at all for this exact volume — fall back to the nearest
          // English volume rather than an exact-volume-but-wrong-language guess.
          const enCovers = covers.filter(isEn)
          if (target && enCovers.length) {
            const numeric = parseFloat(target)
            const withVolume = enCovers
              .map(c => ({ c, v: parseFloat(c.attributes.volume) }))
              .filter(({ v }) => !Number.isNaN(v))
            const below = withVolume.filter(({ v }) => v <= numeric).sort((a, b) => b.v - a.v)[0]
            const above = withVolume.filter(({ v }) => v > numeric).sort((a, b) => a.v - b.v)[0]
            chosen = (below || above)?.c || enCovers[0]
          } else {
            chosen = enCovers[0] || covers[0]
          }
        }

        const fileName = chosen?.attributes?.fileName
        if (fileName) return `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.256.jpg`
      }
    }
  } catch {}
  return fallbackFileName ? `https://uploads.mangadex.org/covers/${mangaId}/${fallbackFileName}.256.jpg` : null
}

async function searchMangaDex(query) {
  const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=10&includes[]=author&includes[]=artist&includes[]=cover_art`
  const res = await fetchWithRetry(url, { headers: { 'User-Agent': 'VaultWave/1.0' } })
  if (!res.ok) return []
  const data = await res.json()
  return data.data || []
}

async function enrichFromMangaDex(title, volume) {
  try {
    // MangaDex's search tokenizes on whitespace, so spine text like "Dan Da
    // Dan" (vs. the real one-word title "Dandadan") can miss the correct
    // series entirely — also try a space-stripped variant of the query.
    const compact = title.replace(/\s+/g, '')
    const queries = compact.toLowerCase() !== title.toLowerCase() ? [title, compact] : [title]

    const resultSets = await Promise.all(queries.map(searchMangaDex))
    const seen = new Map()
    for (const set of resultSets) {
      for (const r of set) seen.set(r.id, r)
    }
    const results = Array.from(seen.values())
    if (!results.length) return {}

    const result = bestMatch(title, results, r => [
      r.attributes?.title?.en,
      r.attributes?.title?.['ja-ro'],
      r.attributes?.title?.ja,
      ...(r.attributes?.altTitles || []).flatMap(t => Object.values(t)),
    ])
    if (!result) return {}

    const attrs = result.attributes
    const coverRel = result.relationships?.find(r => r.type === 'cover_art')
    const cover_url = await fetchVolumeCover(result.id, volume, coverRel?.attributes?.fileName)

    return {
      title:     attrs?.title?.en || attrs?.title?.['ja-ro'] || title,
      author:    result.relationships?.find(r => r.type === 'author')?.attributes?.name || '',
      year:      attrs?.year?.toString() || '',
      genre:     attrs?.tags?.find(t => t.attributes?.group === 'genre')?.attributes?.name?.en || '',
      cover_url,
      status:    attrs?.status || '',
    }
  } catch {
    return {}
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const { type, title, artist, author, volume } = await request.json()

    if (!title) {
      return NextResponse.json({})
    }

    let enriched = {}

    if (type === 'vinyl' || type === 'cd') {
      enriched = await enrichFromDiscogs(title, artist)
    } else if (type === 'comic') {
      enriched = await enrichFromComicVine(title)
    } else if (type === 'manga') {
      const google = await enrichFromGoogleBooks(title, volume)
      enriched = google.cover_url ? google : await enrichFromMangaDex(title, volume)
    }

    return NextResponse.json(enriched)
  } catch (err) {
    // Enrichment failure is non-fatal — return empty object
    return NextResponse.json({})
  }
}
