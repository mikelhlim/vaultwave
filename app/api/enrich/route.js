import { NextResponse } from 'next/server'

// ─── Discogs ─────────────────────────────────────────────────────────────────
async function enrichFromDiscogs(title, artist) {
  try {
    const query = [title, artist].filter(Boolean).join(' ')
    const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&per_page=1`
    const res = await fetch(url, {
      headers: {
        Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
        'User-Agent': 'VaultWave/1.0',
      },
    })
    if (!res.ok) return {}
    const data = await res.json()
    const result = data.results?.[0]
    if (!result) return {}
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
    const url = `https://comicvine.gamespot.com/api/search/?api_key=${process.env.COMICVINE_API_KEY}&format=json&query=${encodeURIComponent(title)}&resources=issue&limit=1&field_list=name,volume,start_year,publisher,image,description`
    const res = await fetch(url, { headers: { 'User-Agent': 'VaultWave/1.0' } })
    if (!res.ok) return {}
    const data = await res.json()
    const result = data.results?.[0]
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

// ─── MangaDex ────────────────────────────────────────────────────────────────
async function enrichFromMangaDex(title) {
  try {
    const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1&includes[]=cover_art`
    const res = await fetch(url, { headers: { 'User-Agent': 'VaultWave/1.0' } })
    if (!res.ok) return {}
    const data = await res.json()
    const result = data.data?.[0]
    if (!result) return {}

    const attrs = result.attributes
    const coverRel = result.relationships?.find(r => r.type === 'cover_art')
    const coverFile = coverRel?.attributes?.fileName
    const cover_url = coverFile
      ? `https://uploads.mangadex.org/covers/${result.id}/${coverFile}.256.jpg`
      : null

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
    const { type, title, artist, author } = await request.json()

    if (!title) {
      return NextResponse.json({})
    }

    let enriched = {}

    if (type === 'vinyl' || type === 'cd') {
      enriched = await enrichFromDiscogs(title, artist)
    } else if (type === 'comic') {
      enriched = await enrichFromComicVine(title)
    } else if (type === 'manga') {
      enriched = await enrichFromMangaDex(title)
    }

    return NextResponse.json(enriched)
  } catch (err) {
    // Enrichment failure is non-fatal — return empty object
    return NextResponse.json({})
  }
}
