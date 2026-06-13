-- ═══════════════════════════════════════════════════════════════
-- VaultWave — Full Database Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Profiles ────────────────────────────────────────────────────────────────
-- Extends Supabase auth.users with public profile info
CREATE TABLE IF NOT EXISTS profiles (
  id                   uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name         text,
  avatar_url           text,
  public_profile_slug  text UNIQUE,
  is_public            boolean DEFAULT false,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ─── Items ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items (
  id                    uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id               uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,

  -- Core
  type                  text CHECK (type IN ('vinyl', 'cd', 'comic', 'manga')) NOT NULL,
  title                 text NOT NULL,
  subtitle              text,

  -- Music fields
  artist                text,
  album                 text,

  -- Comics / Manga fields
  author                text,
  publisher             text,
  volume_number         integer,
  issue_number          text,

  -- Shared metadata
  year                  smallint,
  genre                 text,
  condition             text CHECK (condition IN ('NM', 'VG+', 'VG', 'G', 'F')),
  notes                 text,

  -- Media
  cover_url             text,

  -- External IDs (for dedup and re-enrichment)
  external_id_discogs   text,
  external_id_comicvine text,
  external_id_mangadex  text,

  -- Variant tracking (e.g. different pressings of same album)
  is_variant            boolean DEFAULT false,
  parent_item_id        uuid REFERENCES items(id) ON DELETE SET NULL,

  -- Collection state
  wishlist              boolean DEFAULT false,
  lent_to               text,
  lent_at               timestamptz,

  -- Timestamps
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own items
CREATE POLICY "Users manage own items"
  ON items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public items are readable by anyone (for public profiles)
CREATE POLICY "Public items readable by anyone"
  ON items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = items.user_id
      AND profiles.is_public = true
    )
  );

-- ─── Tags ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id         uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name       text NOT NULL,
  color      text,
  UNIQUE (user_id, name)
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tags"
  ON tags FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Item Tags (junction) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_tags (
  item_id    uuid REFERENCES items(id) ON DELETE CASCADE NOT NULL,
  tag_id     uuid REFERENCES tags(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (item_id, tag_id)
);

ALTER TABLE item_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own item tags"
  ON item_tags FOR ALL
  USING (
    EXISTS (SELECT 1 FROM items WHERE items.id = item_id AND items.user_id = auth.uid())
  );

-- ─── Indexes ─────────────────────────────────────────────────────────────────
-- Fast lookups by user
CREATE INDEX IF NOT EXISTS items_user_id_idx ON items(user_id);

-- Fast lookups by type
CREATE INDEX IF NOT EXISTS items_type_idx ON items(type);

-- Full-text search index
ALTER TABLE items ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(artist, '') || ' ' ||
      coalesce(album, '') || ' ' ||
      coalesce(author, '') || ' ' ||
      coalesce(publisher, '') || ' ' ||
      coalesce(genre, '') || ' ' ||
      coalesce(notes, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS items_fts_idx ON items USING GIN(fts);

-- ─── Auto-update updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Auto-create profile on signup ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, public_profile_slug)
  VALUES (
    NEW.id,
    split_part(NEW.email, '@', 1),
    lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9]', '-', 'g'))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Storage bucket policy ───────────────────────────────────────────────────
-- Run this AFTER creating the 'covers' bucket in Storage
-- (Supabase Dashboard → Storage → covers → Policies)
--
-- INSERT policy: authenticated users can upload to their own folder
-- SELECT policy: public read (covers are public)
--
-- If you prefer to do it via SQL:
INSERT INTO storage.buckets (id, name, public) VALUES ('covers', 'covers', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "Authenticated users can upload covers"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'covers' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Covers are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'covers');

CREATE POLICY "Users can delete own covers"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'covers' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
