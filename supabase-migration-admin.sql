-- ═══════════════════════════════════════════════════════════════
-- VaultWave — Admin & Roles Migration
-- Run once in: Supabase Dashboard → SQL Editor → New Query
--
-- What this does:
--   - Adds a `role` ('admin' | 'viewer') to profiles, defaulting to 'viewer'
--   - Turns the item collection into ONE shared catalog: any signed-in
--     user can read it, but only admins can insert/update/delete
--   - Lets admins list every profile (needed by the /admin page)
--
-- Run this AFTER supabase-schema.sql has already been applied.
-- After running this, create the first admin with:
--   node scripts/create-admin.js you@example.com
-- ═══════════════════════════════════════════════════════════════

-- ─── Role column ─────────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'viewer'
  CHECK (role IN ('admin', 'viewer'));

-- ─── Helper: is the current signed-in user an admin? ─────────────────────────
-- SECURITY DEFINER so this can read profiles without recursing through RLS.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Profiles: admins can see every profile (for the admin/users page) ───────
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin());

-- ─── Items: shared catalog — everyone signed in can read, only admins write ──
DROP POLICY IF EXISTS "Users manage own items" ON items;

DROP POLICY IF EXISTS "Signed-in users can view the catalog" ON items;
CREATE POLICY "Signed-in users can view the catalog"
  ON items FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can add items" ON items;
CREATE POLICY "Admins can add items"
  ON items FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update items" ON items;
CREATE POLICY "Admins can update items"
  ON items FOR UPDATE
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete items" ON items;
CREATE POLICY "Admins can delete items"
  ON items FOR DELETE
  USING (is_admin());
