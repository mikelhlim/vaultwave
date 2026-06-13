import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// GET /api/items?user_id=xxx&type=vinyl&search=kind+of+blue
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const user_id = searchParams.get('user_id')
  const type    = searchParams.get('type')
  const search  = searchParams.get('search')

  if (!user_id) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  }

  const supabase = getSupabase()
  let query = supabase.from('items').select('*').eq('user_id', user_id)

  if (type && type !== 'all') query = query.eq('type', type)
  if (search) query = query.ilike('title', `%${search}%`)

  query = query.order('created_at', { ascending: false })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/items — create item
export async function POST(request) {
  try {
    const body = await request.json()
    const supabase = getSupabase()
    const { data, error } = await supabase.from('items').insert(body).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
