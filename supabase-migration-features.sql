-- ═══════════════════════════════════════════════════════════════
-- VaultWave — Feature Set Migration (tracklist, Jikan id, variants, indexes)
-- Run once in: Supabase Dashboard → SQL Editor → New Query
--
-- Run this AFTER supabase-schema.sql and supabase-migration-admin.sql
-- have already been applied.
--
-- What this does:
--   - Adds is_variant / parent_item_id for duplicate/variant tagging.
--     NOTE: supabase-schema.sql's CREATE TABLE IF NOT EXISTS defines these,
--     but if your `items` table was created before that file was updated
--     to include them, IF NOT EXISTS is a no-op and they were never
--     actually added — this migration adds them defensively either way.
--   - Adds tracklist (jsonb) for vinyl/CD track listings
--   - Adds external_id_jikan for MyAnimeList-matched manga (powers the
--     collection-scoped manga news feed)
--   - Indexes created_at (default sort) and parent_item_id (variant lookups)
--
-- Every statement is idempotent (IF NOT EXISTS) — safe to re-run.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE items ADD COLUMN IF NOT EXISTS is_variant boolean DEFAULT false;
ALTER TABLE items ADD COLUMN IF NOT EXISTS parent_item_id uuid REFERENCES items(id) ON DELETE SET NULL;

ALTER TABLE items ADD COLUMN IF NOT EXISTS tracklist jsonb;
ALTER TABLE items ADD COLUMN IF NOT EXISTS external_id_jikan text;

CREATE INDEX IF NOT EXISTS items_created_at_idx ON items(created_at DESC);
CREATE INDEX IF NOT EXISTS items_parent_item_id_idx ON items(parent_item_id);
