/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'img.discogs.com' },
      { protocol: 'https', hostname: 'comicvine.gamespot.com' },
      { protocol: 'https', hostname: 'uploads.mangadex.org' },
    ],
  },
}

module.exports = nextConfig
