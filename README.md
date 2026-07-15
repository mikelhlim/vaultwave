# VAULTWAVE

A minimalist media collection app for serious collectors of vinyl, CDs, comics, and manga. Upload a photo, Claude identifies it, and it saves to your cloud vault automatically.

---

## Stack

- **Next.js 14** — framework
- **Supabase** — database, auth, file storage
- **Claude API** — photo detection via Claude Vision
- **Discogs API** — vinyl/CD metadata enrichment
- **ComicVine API** — comics metadata enrichment
- **Google Books API** — manga cover art (primary — real published English editions)
- **MangaDex API** — manga metadata + cover fallback (free, no key needed)

---

## Setup — Step by Step

### 1. Prerequisites

Make sure you have these installed:

```bash
node -v   # Should show v18 or higher
npm -v    # Should show v9 or higher
```

If not, install Node.js from https://nodejs.org (LTS version).

---

### 2. Install dependencies

```bash
npm install
```

---

### 3. Set up Supabase

1. Create a free account at https://supabase.com
2. Click **New project** — name it `vaultwave`
3. Go to **SQL Editor → New Query**, paste the entire contents of `supabase-schema.sql`, and click **Run**
4. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://xxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)
   - **service_role key** (keep this secret — never commit it)

---

### 4. Set up auth

In Supabase → **Authentication → URL Configuration**:

- Set **Site URL** to: `http://localhost:3000`
- Add to **Redirect URLs**: `http://localhost:3000/auth/callback`

For Google OAuth (optional):
1. Go to https://console.cloud.google.com
2. Create a project → APIs & Services → Credentials → OAuth 2.0 Client ID
3. Set redirect URI to: `https://your-project.supabase.co/auth/v1/callback`
4. Paste the Client ID and Secret into Supabase → Authentication → Providers → Google

---

### 5. Get your API keys

**Anthropic (Claude)**
- Go to https://console.anthropic.com → API Keys → Create key

**Discogs**
- Go to https://www.discogs.com/settings/developers → Generate token

**ComicVine**
- Go to https://comicvine.gamespot.com/api → Request API key

**MangaDex** — no key needed, it's a free public API.

**Google Books** (optional, recommended) — used first for manga covers since it indexes real published English volumes, more accurately than MangaDex. Works without a key, but the anonymous quota is shared globally and runs out fast:
- Go to https://console.cloud.google.com → New Project → APIs & Services → Library → enable **Books API** → Credentials → Create API Key (no billing account required)

---

### 6. Configure environment variables

Copy the example env file and fill in your keys:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

ANTHROPIC_API_KEY=your-anthropic-key

DISCOGS_TOKEN=your-discogs-token
COMICVINE_API_KEY=your-comicvine-key
GOOGLE_BOOKS_API_KEY=your-google-books-key

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

### 7. Set up admin & roles

VaultWave has one shared catalog with two roles:

- **admin** — can add/edit/delete items, and manage user accounts from `/admin`
- **viewer** — can browse and search the catalog, read-only

Run the migration once in **Supabase → SQL Editor**, pasting the contents of `supabase-migration-admin.sql` (this must run *after* `supabase-schema.sql`). It adds `profiles.role` and switches the item policies from per-user ownership to a shared, admin-writable catalog.

Then create the first admin account:

```bash
node scripts/create-admin.js you@example.com
```

This prints a generated password (or pass one explicitly as a second argument). Sign in at `/login` with that email/password. From `/admin` you can create additional view-only accounts — new accounts get the default password `123456`.

---

### 8. Run the app

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

---

## Features

| Feature | Status |
|---|---|
| Email magic link login | ✅ |
| Google OAuth login | ✅ |
| Photo upload + Claude Vision detection | ✅ |
| Type detection (Vinyl / CD / Comic / Manga) | ✅ |
| Confirm / edit detected metadata | ✅ |
| Discogs enrichment (vinyl/CD) | ✅ |
| ComicVine enrichment (comics) | ✅ |
| MangaDex enrichment (manga) | ✅ |
| Cover image upload to Supabase Storage | ✅ |
| Shelf view (visual grid) | ✅ |
| List view (dense table) | ✅ |
| Search (title, artist, author, genre) | ✅ |
| Filter by condition (NM, VG+, VG, G, F) | ✅ |
| Sort by recent / title / year | ✅ |
| Item detail panel | ✅ |
| Edit item | ✅ |
| Delete item | ✅ |
| Wishlist toggle | ✅ |
| Public read-only profile URL | ✅ |
| Full-text search index (GIN) | ✅ |
| Auto-create profile on signup | ✅ |
| Admin/viewer roles, shared catalog | ✅ |
| Admin page — create view-only users | ✅ |
| Bulk delete (single item, multi-select, delete-all by category) | ✅ |

---

## Project Structure

```
vaultwave/
├── app/
│   ├── layout.js              # Root layout + global CSS
│   ├── page.js                # Home — shelf/list view
│   ├── globals.css            # Global styles + design tokens
│   ├── login/
│   │   └── page.js            # Login page (magic link + Google)
│   ├── add/
│   │   └── page.js            # Add item (photo upload + manual)
│   ├── edit/[id]/
│   │   └── page.js            # Edit item
│   ├── auth/callback/
│   │   └── route.js           # Supabase auth callback
│   ├── u/[slug]/
│   │   ├── page.js            # Public profile (server component)
│   │   └── PublicProfileClient.js
│   └── api/
│       ├── detect/route.js    # Claude Vision detection
│       ├── enrich/route.js    # Discogs/ComicVine/MangaDex
│       └── items/route.js     # Items CRUD (server-side)
├── components/
│   ├── Sidebar.js             # Navigation sidebar
│   ├── ItemCard.js            # ShelfItem + ListItem cards
│   └── DetailPanel.js         # Slide-in item detail
├── lib/
│   ├── supabase.js            # Supabase client
│   └── constants.js           # Types, colors, field configs
├── supabase-schema.sql        # Full DB schema — run in Supabase
├── .env.local.example         # Environment variable template
└── next.config.js
```

---

## Deploying to production (Vercel)

1. Push your code to a GitHub repo (never commit `.env.local`)
2. Go to https://vercel.com → Import your repo
3. Add all environment variables from `.env.local` to the Vercel project settings
4. Update `NEXT_PUBLIC_APP_URL` to your Vercel domain
5. Update Supabase → Authentication → URL Configuration with your Vercel domain

---

## Making your profile public

After logging in, go to Supabase → Table Editor → profiles, find your row, and set `is_public = true`. Your collection will then be visible at:

```
http://localhost:3000/u/your-username
```

---

## License

MIT — build your vault.
