import { nameFieldFor } from './constants'

// ─── Title matching ────────────────────────────────────────────────────────────
// Strips punctuation/spacing so e.g. "Dan Da Dan" and "Dandadan" compare equal.
export function normalizeTitle(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

// Dice's coefficient over character bigrams — cheap, dependency-free, and
// good enough to rank near-miss titles without a fuzzy-matching library.
export function titleSimilarity(a, b) {
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
export const MATCH_THRESHOLD = 0.6
export function bestMatch(query, candidates, getTitles) {
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

// ─── Duplicate/variant detection ───────────────────────────────────────────────
// Stricter than MATCH_THRESHOLD — a false-positive "is this a duplicate?"
// prompt is real per-save friction, so this only fires on close matches.
const DUPLICATE_THRESHOLD = 0.8

// findPossibleDuplicate(newItem, existingItems) -> { match, score } | null
// Same `type` only (schema's own comment calls these "different pressings of
// same album" — cross-format isn't in scope). Music: name (album) similarity
// AND artist similarity both required, mirroring enrichFromDiscogs's own
// artist-then-title double filter. Comics/manga: title similarity required,
// AND if both records have a volume_number/issue_number set, they must be
// equal — Vol. 3 must never flag against Vol. 4, those are different catalog
// entries, not variants of one item.
export function findPossibleDuplicate(newItem, existingItems) {
  const type = newItem.type
  const name = newItem[nameFieldFor(type)]
  if (!name) return null

  const isMusic = type === 'vinyl' || type === 'cd'
  const sameType = existingItems.filter(i => i.type === type)

  let best = null
  let bestScore = 0

  for (const existing of sameType) {
    const existingName = existing[nameFieldFor(type)]
    if (!existingName) continue

    const nameScore = titleSimilarity(name, existingName)
    if (nameScore < DUPLICATE_THRESHOLD) continue

    if (isMusic) {
      const artistScore = titleSimilarity(newItem.artist || '', existing.artist || '')
      if (artistScore < DUPLICATE_THRESHOLD) continue
    } else {
      const newVol = newItem.volume_number ?? newItem.issue_number
      const existingVol = existing.volume_number ?? existing.issue_number
      if (newVol != null && newVol !== '' && existingVol != null) {
        // Compare numerically when possible — a freshly-detected "07" must
        // still match an existing 7 stored as an integer, or every
        // leading-zero volume silently misses its real duplicate.
        const newVolNum = parseFloat(newVol)
        const existingVolNum = parseFloat(existingVol)
        const mismatch = !Number.isNaN(newVolNum) && !Number.isNaN(existingVolNum)
          ? newVolNum !== existingVolNum
          : String(newVol) !== String(existingVol)
        if (mismatch) continue
      }
    }

    if (nameScore > bestScore) {
      bestScore = nameScore
      best = existing
    }
  }

  return best ? { match: best, score: bestScore } : null
}
