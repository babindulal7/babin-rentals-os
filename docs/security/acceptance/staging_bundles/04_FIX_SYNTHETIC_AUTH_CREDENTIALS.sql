-- =============================================================================
-- Babin Rentals OS — Staging Stage 2: GoTrue Credentials & Identity Alignment
-- Target: babin-staging (klhmsrunqrdxjudyhnkm, Singapore)
-- Scope: Set aud='authenticated', role='authenticated', bcrypt password,
--        and email identity in auth.identities for all synthetic test accounts.
-- Paste into Supabase SQL Editor for klhmsrunqrdxjudyhnkm and run.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  r RECORD;
BEGIN
  -- 1. Ensure auth.users has aud and role set to 'authenticated'
  UPDATE auth.users
  SET aud = 'authenticated',
      role = 'authenticated',
      encrypted_password = extensions.crypt('BabinSynthetic2026!', extensions.gen_salt('bf', 10)),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      is_sso_user = false,
      updated_at = now()
  WHERE email LIKE '%@babinrentals.test';

  -- 2. Ensure auth.identities has an email identity for each user
  FOR r IN SELECT id, email FROM auth.users WHERE email LIKE '%@babinrentals.test' LOOP
    DELETE FROM auth.identities WHERE user_id = r.id;
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      r.id,
      jsonb_build_object('sub', r.id::text, 'email', r.email),
      'email',
      r.id::text,
      now(),
      now(),
      now()
    );
  END LOOP;
END $$;

COMMIT;

-- Verification output for operator
SELECT u.id, u.email, u.aud, u.role, u.email_confirmed_at IS NOT NULL AS confirmed, i.provider
FROM auth.users u
LEFT JOIN auth.identities i ON i.user_id = u.id
WHERE u.email LIKE '%@babinrentals.test'
ORDER BY u.email;
