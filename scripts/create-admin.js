#!/usr/bin/env node
// Creates the first VaultWave admin account.
// Usage: node scripts/create-admin.js you@example.com [password]
// If no password is given, a random one is generated and printed.
//
// Requires supabase-migration-admin.sql to have already been run
// against your Supabase project (adds profiles.role).

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim()
  }
}
loadEnvLocal()

const email = process.argv[2]
const password = process.argv[3] || crypto.randomBytes(9).toString('base64url')

if (!email) {
  console.error('Usage: node scripts/create-admin.js <email> [password]')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey)

async function findExistingUserByEmail(targetEmail) {
  const perPage = 200
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = data.users.find(u => u.email?.toLowerCase() === targetEmail.toLowerCase())
    if (match) return match
    if (data.users.length < perPage) break
  }
  return null
}

async function promoteToAdmin(userId) {
  let roleErr = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error, count } = await supabase
      .from('profiles')
      .update({ role: 'admin' }, { count: 'exact' })
      .eq('id', userId)
    roleErr = error
    if (!error && count) return
    await new Promise(r => setTimeout(r, 300))
  }
  console.error('Failed to set admin role:', roleErr?.message)
  console.error(`Run manually in SQL Editor: update profiles set role = 'admin' where id = '${userId}';`)
  process.exit(1)
}

async function main() {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createErr) {
    if (!/already.*registered/i.test(createErr.message)) {
      console.error('Failed to create user:', createErr.message)
      process.exit(1)
    }

    // Account already exists (e.g. from a prior magic-link login) — promote it instead.
    console.log(`${email} already has an account — promoting it to admin instead of creating a new one.`)
    const existing = await findExistingUserByEmail(email)
    if (!existing) {
      console.error('Could not find the existing user by email via the admin API.')
      process.exit(1)
    }
    await promoteToAdmin(existing.id)
    console.log('Done. That account is now an admin.')
    console.log(`  email: ${email}`)
    console.log('  Sign in the same way you already do (magic link / Google) — its password was not changed.')
    return
  }

  const userId = created.user.id
  await promoteToAdmin(userId)

  console.log('Admin user created.')
  console.log('  email:   ', email)
  console.log('  password:', password)
  console.log('Sign in at /login with this email and password.')
}

main()
