import { createClient } from '@supabase/supabase-js'
import PublicProfileClient from './PublicProfileClient'

export async function generateMetadata({ params }) {
  return {
    title: `${params.slug}'s Collection — VaultWave`,
    description: `Browse ${params.slug}'s media collection on VaultWave.`,
  }
}

export default async function PublicProfilePage({ params }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // Look up user by public_profile_slug
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('public_profile_slug', params.slug)
    .single()

  if (!profile || !profile.is_public) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text3)' }}>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '0.1em' }}>COLLECTION NOT FOUND</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>This collection is private or doesn&apos;t exist.</p>
        </div>
      </div>
    )
  }

  const { data: items } = await supabase
    .from('items')
    .select('id, type, title, artist, author, album, publisher, year, genre, condition, volume_number, cover_url')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })

  return <PublicProfileClient profile={profile} items={items || []} slug={params.slug} />
}
