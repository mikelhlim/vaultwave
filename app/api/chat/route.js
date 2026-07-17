import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/adminAuth'

// Unlike /api/detect and /api/enrich (stateless third-party proxies with no
// data of their own to leak), this route reads and returns the actual
// catalog — so it needs a real signed-in user, not just admin, matching
// "VaultWave keeps your collection private by default."
async function requireUser(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return null
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: { user } } = await anon.auth.getUser(token)
  return user || null
}

// Claude proposes changes via this tool instead of just describing them in
// text — a structured call is what lets the UI render an exact, reviewable
// confirmation card rather than trying to parse "what did it mean" out of
// prose. Calling this tool never touches the database by itself; /api/chat/
// apply does that, and only after the user explicitly confirms.
const TOOLS = [
  {
    name: 'propose_changes',
    description:
      'Propose one or more concrete edits or deletions to items already in the catalog, for the user to review and explicitly confirm. Use this whenever the user asks to fix, update, correct, rename, delete, or otherwise change something in their collection. Never use this to add a brand-new item (there is no tool for that — tell the user to use the Add flow instead). Always reference real item ids from the catalog data you were given; never invent one.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'One short sentence describing this batch of changes, shown above the list, e.g. "Standardize the DanDaDan series title across 7 volumes."',
        },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item_id: { type: 'string', description: 'Exact id of the item from the catalog data.' },
              label: { type: 'string', description: 'Human-readable label for this item, e.g. "Dandadan Vol. 14 by Yukinobu Tatsu".' },
              action: { type: 'string', enum: ['update', 'delete'] },
              fields: {
                type: 'object',
                description: 'For action=update only: { field_name: new_value }. Only include fields that actually change. Allowed fields: title, artist, album, author, publisher, year, genre, volume_number, condition, notes, wishlist, lent_to.',
              },
            },
            required: ['item_id', 'label', 'action'],
          },
        },
      },
      required: ['summary', 'changes'],
    },
  },
]

export async function POST(request) {
  try {
    const user = await requireUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Sign in to ask about your collection.' }, { status: 401 })
    }

    const { message, history } = await request.json()
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 })
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY || ''
    const configuredModel = (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6').trim()
    const modelCandidates = Array.from(
      new Set([configuredModel, 'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-3-5-sonnet-latest'].filter(Boolean))
    )

    if (!anthropicKey || anthropicKey.includes('your-anthropic-api-key')) {
      return NextResponse.json(
        { error: 'Anthropic API key is missing or invalid. Add a real ANTHROPIC_API_KEY to .env.local and restart the dev server.' },
        { status: 500 }
      )
    }

    // Small personal collection — cheap enough to hand Claude the whole
    // catalog as context rather than building a query layer for it.
    const supabase = getServiceClient()
    const { data: items } = await supabase.from('items').select('*').order('created_at', { ascending: false })

    const catalog = (items || []).map(i => ({
      id: i.id,
      type: i.type,
      title: i.title || undefined,
      artist: i.artist || undefined,
      album: i.album || undefined,
      author: i.author || undefined,
      publisher: i.publisher || undefined,
      year: i.year || undefined,
      genre: i.genre || undefined,
      volume_number: i.volume_number ?? undefined,
      condition: i.condition || undefined,
      notes: i.notes || undefined,
      wishlist: i.wishlist || undefined,
      lent_to: i.lent_to || undefined,
      tracklist: i.tracklist?.length ? i.tracklist : undefined,
      is_variant: i.is_variant || undefined,
      added: i.created_at ? i.created_at.slice(0, 10) : undefined,
    }))

    const systemPrompt = `You are the VaultWave collection assistant. You answer questions about the user's physical media collection (vinyl records, CDs, comics, manga) using ONLY the catalog data below — never invent items that aren't listed, and say so plainly if the data doesn't answer the question.

Reply in plain text only — no markdown (no **bold**, no # headings, no backticks). This renders in a plain chat bubble, so use line breaks and dashes for lists instead of markdown syntax.

Today's date: ${new Date().toISOString().slice(0, 10)}

Catalog — JSON array, ${catalog.length} items total (fields are omitted when empty):
${JSON.stringify(catalog)}

Answer naturally and concisely. For counts, lists, or lookups, work them out precisely from the data above. Prefer short lists over long prose when listing multiple items. Don't mention that you were given JSON — just answer like you know the collection.

Some vinyl/CD items include a "tracklist" array (position, title, duration) — use it for track-level questions (e.g. "which albums have a song called X"). Coverage is partial, not universal: only albums where a cover/tracklist lookup has actually run have it. If an album has no tracklist field, say you don't have the track listing for that one specifically rather than implying no album in the collection has track data.

If the user asks you to change, fix, correct, rename, or delete something, use the propose_changes tool rather than just describing the change in words — the user reviews and explicitly confirms proposals before anything is actually changed, and only admins can confirm. Reference exact item ids from the catalog above. If a request is ambiguous (e.g. "delete the duplicate" when there are several candidates), ask a clarifying question in plain text first instead of guessing which item(s) to propose.`

    const history_ = Array.isArray(history)
      ? history
          .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .slice(-12)
      : []
    const messages = [...history_, { role: 'user', content: message }]

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
          max_tokens: 1536,
          system: systemPrompt,
          messages,
          tools: TOOLS,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const blocks = data.content || []
        const reply = blocks.map(b => (b.type === 'text' ? b.text : '')).join('').trim()
        const toolCall = blocks.find(b => b.type === 'tool_use' && b.name === 'propose_changes')
        const proposal = toolCall
          ? {
              summary: toolCall.input?.summary || '',
              changes: Array.isArray(toolCall.input?.changes) ? toolCall.input.changes : [],
            }
          : null

        return NextResponse.json({ reply, proposal })
      }

      const raw = await response.text()
      let parsedError = null
      try { parsedError = JSON.parse(raw) } catch {}

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
    const errMessage =
      failure.errorType === 'not_found_error'
        ? `Anthropic model '${failure.model}' is not available for this API key. Update ANTHROPIC_MODEL in .env.local to a current Claude model.`
        : `Claude API error: ${failure.raw || failure.errorMessage}`

    return NextResponse.json({ error: errMessage }, { status: 500 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
