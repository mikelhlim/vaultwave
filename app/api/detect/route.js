import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const { base64, mimeType } = await request.json()
    const anthropicKey = process.env.ANTHROPIC_API_KEY || ''
    const configuredModel = (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6').trim()
    const modelCandidates = Array.from(
      new Set([configuredModel, 'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-3-5-sonnet-latest'].filter(Boolean))
    )

    if (!base64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    if (!anthropicKey || anthropicKey.includes('your-anthropic-api-key')) {
      return NextResponse.json(
        { error: 'Anthropic API key is missing or invalid. Add a real ANTHROPIC_API_KEY to .env.local and restart the dev server.' },
        { status: 500 }
      )
    }

    const prompt = `You are a media cataloging expert specializing in physical media collections.

Analyze this image carefully and identify ALL media items visible — there may be one item or many (e.g. a shelf of records, a stack of manga, a mix of CDs and comics).

Respond ONLY with a valid JSON array — no markdown, no explanation, no backticks. Just a raw JSON array.

Each element in the array represents one distinct media item you can identify:

[
  {
    "type": "vinyl" | "cd" | "comic" | "manga",
    "title": "string or null",
    "artist": "string or null — for vinyl/cd only",
    "album": "string or null — for vinyl/cd only",
    "author": "string or null — for comic/manga only",
    "publisher": "string or null",
    "year": "string or null — 4-digit year",
    "genre": "string or null",
    "volume": "string or null — volume/issue number for manga/comics",
    "confidence": "high" | "medium" | "low"
  }
]

Rules:
- Always return an array, even if only one item is detected: [{ ... }]
- type must be one of: vinyl, cd, comic, manga
- vinyl = vinyl record (LP, EP, 7", 12")
- cd = compact disc
- comic = western comic book (Marvel, DC, Image, etc.)
- manga = Japanese comic book or graphic novel
- If you cannot read a field clearly, set it to null — do not guess
- Only include items you can actually identify from visible text or art
- year should be the release year if visible
- If the image shows a spine or back cover, use whatever text is legible
- Include partially visible items only if you can read enough to identify the title`

    let lastError = null

    for (const model of modelCandidates) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mimeType || 'image/jpeg',
                    data: base64,
                  },
                },
                { type: 'text', text: prompt },
              ],
            },
          ],
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const raw = data.content?.map(c => c.text || '').join('').trim()
        const clean = raw.replace(/```json|```/g, '').trim()

        let parsed
        try {
          parsed = JSON.parse(clean)
        } catch {
          return NextResponse.json({ error: 'Could not parse Claude response', raw }, { status: 500 })
        }

        // Normalise: always return an array
        const items = Array.isArray(parsed) ? parsed : [parsed]

        // Assign a stable client-side id to each for React keying
        const withIds = items.map((item, i) => ({
          _id: `detected-${Date.now()}-${i}`,
          ...item,
          type: item.type || 'vinyl',
        }))

        return NextResponse.json({ items: withIds, count: withIds.length })
      }

      const raw = await response.text()
      let parsedError = null

      try {
        parsedError = JSON.parse(raw)
      } catch {}

      const errorType = parsedError?.error?.type || ''
      const errorMessage = parsedError?.error?.message || raw

      if (errorType === 'authentication_error' || errorMessage.toLowerCase().includes('x-api-key')) {
        return NextResponse.json(
          { error: 'Anthropic API key is invalid or expired. Update ANTHROPIC_API_KEY in .env.local and restart the dev server.' },
          { status: 500 }
        )
      }

      lastError = { model, errorType, errorMessage, raw }

      if (errorType === 'not_found_error' || errorMessage.toLowerCase().includes('model')) {
        continue
      }

      return NextResponse.json({ error: `Claude API error: ${raw}` }, { status: 500 })
    }

    const failure = lastError || { model: configuredModel, errorMessage: 'Unknown Anthropic error' }
    const message =
      failure.errorType === 'not_found_error'
        ? `Anthropic model '${failure.model}' is not available for this API key. Update ANTHROPIC_MODEL in .env.local to a current Claude model (for example, claude-sonnet-4-6) and restart the dev server.`
        : `Claude API error: ${failure.raw || failure.errorMessage}`

    return NextResponse.json({ error: message }, { status: 500 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
