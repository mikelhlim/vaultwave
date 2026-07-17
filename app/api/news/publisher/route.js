import { NextResponse } from 'next/server'

// Kodansha's own WordPress site — verified live: kodansha.us/news/feed/ (RSS)
// works but carries no image data at all (no <enclosure>/media:thumbnail
// anywhere in the feed), while the same site's REST API
// (kodansha.us/wp-json/wp/v2/posts?_embed) returns the identical posts as
// clean JSON *with* real featured-image URLs. VIZ and Shonen Jump/Manga Plus
// have no equivalent public feed as of this check, so this is the one
// genuinely official publisher source in the news mix (the other manga
// sections are Jikan/MyAnimeList, which covers VIZ/Shonen Jump series but
// isn't sourced from VIZ itself).
const POSTS_URL = 'https://kodansha.us/wp-json/wp/v2/posts?per_page=10&_embed'

function decodeEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function GET() {
  try {
    const res = await fetch(POSTS_URL, {
      headers: { 'User-Agent': 'VaultWave/1.0' },
      next: { revalidate: 21600 }, // 6h — matches the other manga news sources
    })
    if (!res.ok) return NextResponse.json({ items: [] })
    const posts = await res.json()

    const items = (Array.isArray(posts) ? posts : []).map(p => {
      const media = p._embedded?.['wp:featuredmedia']?.[0]
      const image =
        media?.media_details?.sizes?.medium?.source_url ||
        media?.source_url ||
        null

      const excerpt = p.excerpt?.rendered
        ? decodeEntities(stripTags(p.excerpt.rendered)).replace(/\[…\]$/, '').trim()
        : ''

      return {
        title: p.title?.rendered ? decodeEntities(stripTags(p.title.rendered)) : null,
        url: p.link || null,
        date: p.date ? new Date(p.date).toISOString() : null,
        excerpt,
        image_url: image,
      }
    }).filter(item => item.title && item.url)

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
