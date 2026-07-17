import { NextResponse } from 'next/server'

// Verified against live Apple data: "J-Rock" isn't a distinct genre tag
// (ONE OK ROCK is filed under plain "Rock", covered by the bare 'rock'
// keyword below) — a data-source limitation, not a bug. "Dance" and
// "Electronic" are both real, separate tags (Daft Punk/deadmau5 = Dance,
// Aphex Twin/Kraftwerk = Electronic), so both are included.
const GENRE_KEYWORDS = [
  'rock', 'metal', 'alternative', 'punk',
  'j-pop', 'j-rock',
  'electronic', 'dance',
  'jazz',
]

// Returns the specific genre name that matched (not just whether any did) —
// an album often carries multiple tags (e.g. "Pop" + "Dance"), and surfacing
// the one that actually qualified it avoids a confusing "why is this here?".
function matchedGenre(genres) {
  for (const g of genres || []) {
    const name = (g.name || '').toLowerCase()
    if (GENRE_KEYWORDS.some(kw => name.includes(kw))) return g.name
  }
  return null
}

// Apple's Marketing Tools feed has no unbounded "new releases" firehose —
// "most-played" (their real Top Albums chart) is the closest free, no-auth
// signal, and the one actually documented to exist ("most-recent" 404s).
export async function GET() {
  try {
    const url = 'https://rss.marketingtools.apple.com/api/v2/us/music/most-played/100/albums.json'
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return NextResponse.json({ items: [] })
    const data = await res.json()
    const results = data.feed?.results || []

    const items = results
      .map(r => ({ r, genre: matchedGenre(r.genres) }))
      .filter(({ genre }) => genre)
      .map(({ r, genre }) => ({
        id:           r.id,
        title:        r.name,
        artist:       r.artistName,
        url:          r.url,
        image_url:    r.artworkUrl100,
        release_date: r.releaseDate,
        genre,
        genres:       (r.genres || []).map(g => g.name).filter(n => n !== 'Music'),
      }))

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
