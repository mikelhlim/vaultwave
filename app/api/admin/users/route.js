import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'

// GET /api/admin/users — list every account with role + email (admin only)
export async function GET(request) {
  const ctx = await requireAdmin(request)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: profiles, error: pErr } = await ctx.admin
    .from('profiles')
    .select('id, role, created_at')
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const { data: { users }, error: uErr } = await ctx.admin.auth.admin.listUsers()
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  const emailById = Object.fromEntries(users.map(u => [u.id, u.email]))
  const merged = profiles
    .map(p => ({ id: p.id, role: p.role, created_at: p.created_at, email: emailById[p.id] || '' }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return NextResponse.json(merged)
}

// POST /api/admin/users — create a view-only account with the default password
export async function POST(request) {
  const ctx = await requireAdmin(request)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const { data, error } = await ctx.admin.auth.admin.createUser({
    email,
    password: '123456',
    email_confirm: true,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // profiles.role defaults to 'viewer' via the handle_new_user trigger + column default
  return NextResponse.json({ id: data.user.id, email: data.user.email })
}
