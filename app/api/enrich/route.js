import { NextResponse } from 'next/server'
import { titleSimilarity, bestMatch, MATCH_THRESHOLD } from '@/lib/matching'

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

// ─── Discogs ─────────────────────────────────────────────────────────────────
// Discogs results are formatted "Artist - Album". Franchise-style album
// titles (MTV Unplugged, Greatest Hits, Live, Unplugged...) are reused by
// dozens of unrelated artists, so matching on the album title alone isn't
// enough — the artist has to match too, or we silently attach a stranger's
// cover art.
function splitDiscogsTitle(r) {
  const parts = (r.title || '').split(' - ')
  return {
    artist: parts[0] || '',
    album: parts.length > 1 ? parts.slice(1).join(' - ') : (r.title || ''),
  }
}

// Fetches a specific release for its full fields + tracklist. The search
// endpoint doesn't carry tracklist data — only /releases/{id} does.
async function fetchDiscogsRelease(releaseId) {
  try {
    const url = `https://api.discogs.com/releases/${releaseId}`
    const res = await fetchWithRetry(url, {
      headers: {
        Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
        'User-Agent': 'VaultWave/1.0',
      },
    })
    if (!res.ok) return {}
    const release = await res.json()

    const cover_url = release.images?.find(img => img.type === 'primary')?.uri
      || release.images?.[0]?.uri
      || null

    const tracklist = (release.tracklist || [])
      .filter(t => t.type_ === 'track')
      .map(t => ({ position: t.position || '', title: t.title || '', duration: t.duration || '' }))

    return {
      title:     release.title || '',
      artist:    release.artists?.[0]?.name || '',
      year:      release.year?.toString() || '',
      genre:     release.genres?.[0] || release.styles?.[0] || '',
      cover_url,
      label:     release.labels?.[0]?.name || '',
      catalog:   release.labels?.[0]?.catno || '',
      tracklist,
    }
  } catch {
    return {}
  }
}

// discogsReleaseId shortcuts straight to a specific release — used when the
// caller already has a release picked (e.g. re-fetching after the user
// chooses a cover candidate) instead of re-running the search.
async function enrichFromDiscogs(title, artist, discogsReleaseId) {
  if (discogsReleaseId) return await fetchDiscogsRelease(discogsReleaseId)

  try {
    const query = [title, artist].filter(Boolean).join(' ')
    const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&per_page=10`
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

    const pool = artist
      ? results.filter(r => titleSimilarity(artist, splitDiscogsTitle(r).artist) >= MATCH_THRESHOLD)
      : results

    // Rank every plausible match (not just the winner) so distinct pressings
    // of the same release can be offered as cover candidates below.
    const ranked = pool
      .map(r => ({ r, score: titleSimilarity(title, splitDiscogsTitle(r).album) }))
      .filter(x => x.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score)
    if (!ranked.length) return {}

    const top = await fetchDiscogsRelease(ranked[0].r.id)
    if (!top.cover_url && !top.title) {
      // The release-detail call itself failed — fall back to the search
      // result's own fields rather than returning nothing.
      const matched = splitDiscogsTitle(ranked[0].r)
      return {
        title:     matched.album || title,
        artist:    matched.artist || artist,
        year:      ranked[0].r.year?.toString() || '',
        genre:     ranked[0].r.genre?.[0] || ranked[0].r.style?.[0] || '',
        cover_url: ranked[0].r.cover_image || null,
        label:     ranked[0].r.label?.[0] || '',
        catalog:   ranked[0].r.catno || '',
      }
    }

    const cover_candidates = ranked.length > 1
      ? ranked.slice(0, 5).map(({ r }) => ({
          id:        r.id,
          cover_url: r.cover_image,
          ...splitDiscogsTitle(r),
          year:      r.year?.toString() || '',
          label:     r.label?.[0] || '',
          format:    (r.format || []).join(', '),
        }))
      : undefined

    return { ...top, cover_candidates }
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

    const result = bestMatch(title, results, r => [r.name, r.volume?.name])
    if (!result) return {}

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
        // Compare numerically, not by raw string — spine text like "07" must
        // still match MangaDex's unpadded "7", or every padded volume number
        // silently misses its exact cover and falls through to the nearest
        // English-volume guess instead.
        const targetNum = volumeNumber != null && volumeNumber !== '' ? parseFloat(volumeNumber) : NaN
        const target = !Number.isNaN(targetNum) ? targetNum : null
        const isEn = c => c.attributes?.locale === 'en'
        const atVolume = target != null ? covers.filter(c => parseFloat(c.attributes?.volume) === target) : []

        let chosen =
          atVolume.find(isEn) ||           // exact volume, English
          atVolume[0] ||                   // exact volume, any language
          null

        if (!chosen) {
          // No cover at all for this exact volume — fall back to the nearest
          // English volume rather than an exact-volume-but-wrong-language guess.
          const enCovers = covers.filter(isEn)
          if (target != null && enCovers.length) {
            const withVolume = enCovers
              .map(c => ({ c, v: parseFloat(c.attributes.volume) }))
              .filter(({ v }) => !Number.isNaN(v))
            const below = withVolume.filter(({ v }) => v <= target).sort((a, b) => b.v - a.v)[0]
            const above = withVolume.filter(({ v }) => v > target).sort((a, b) => a.v - b.v)[0]
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

// ─── Jikan (MyAnimeList) ───────────────────────────────────────────────────────
// Tried first for manga per explicit request. Trade-off: MAL's cover art is
// the series' primary key visual, not a volume-specific English print cover
// the way Google Books' listings are — a series will show the same cover
// across different owned volumes more often than the old Google-Books-first
// order did. The chain still falls through to MangaDex/Google Books below
// when Jikan has no cover (including when Jikan/MAL itself is unreachable).
async function enrichFromJikan(title, volume) {
  try {
    const url = `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(title)}&limit=10`
    const res = await fetchWithRetry(url)
    if (!res.ok) return {}
    const data = await res.json()
    const results = data.data || []
    if (!results.length) return {}

    const result = bestMatch(title, results, r => [
      r.title,
      r.title_english,
      r.title_japanese,
      ...(r.titles || []).map(t => t.title),
    ])
    if (!result) return {}

    return {
      title:     result.title_english || result.title || title,
      author:    result.authors?.[0]?.name || '',
      genre:     result.genres?.[0]?.name || '',
      year:      result.published?.from ? result.published.from.slice(0, 4) : '',
      cover_url: result.images?.jpg?.image_url || null,
      mal_id:    result.mal_id ? String(result.mal_id) : null,
    }
  } catch {
    return {}
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const { type, title, artist, author, volume, discogsReleaseId } = await request.json()

    if (!title) {
      return NextResponse.json({})
    }

    let enriched = {}

    if (type === 'vinyl' || type === 'cd') {
      enriched = await enrichFromDiscogs(title, artist, discogsReleaseId)
    } else if (type === 'comic') {
      enriched = await enrichFromComicVine(title)
    } else if (type === 'manga') {
      const jikan = await enrichFromJikan(title, volume)
      enriched = jikan.cover_url ? jikan : {}

      if (!enriched.cover_url) {
        const mdx = await enrichFromMangaDex(title, volume)
        if (mdx.cover_url) enriched = { ...enriched, ...mdx }
      }
      if (!enriched.cover_url) {
        const google = await enrichFromGoogleBooks(title, volume)
        if (google.cover_url) enriched = { ...enriched, ...google }
      }
    }

    return NextResponse.json(enriched)
  } catch (err) {
    // Enrichment failure is non-fatal — return empty object
    return NextResponse.json({})
  }
}
