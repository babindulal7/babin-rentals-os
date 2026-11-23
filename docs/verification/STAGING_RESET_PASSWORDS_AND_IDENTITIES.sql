-- =============================================================================
-- STAGING_RESET_PASSWORDS_AND_IDENTITIES.sql
-- Reset passwords to 'StagingPass2026!' and sync auth.identities for GoTrue
-- Target Project: klhmsrunqrdxjudyhnkm (babin-staging)
-- =============================================================================

begin;

-- 1. Ensure extensions schema is available
create extension if not exists pgcrypto with schema extensions;

-- 2. Update auth.users with clean bcrypt hash and confirmed tokens
update auth.users
set 
  encrypted_password = extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  confirmation_token = '',
  recovery_token = '',
  email_change = '',
  email_change_token_new = '',
  raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', array['email']),
  aud = 'authenticated',
  role = 'authenticated',
  is_sso_user = false,
  updated_at = now()
where email like 'staging-%@babinrentals.test';

-- 3. Clean up and refresh auth.identities for these 9 staging users
delete from auth.identities 
where user_id in (select id from auth.users where email like 'staging-%@babinrentals.test');

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select 
  id, 
  id, 
  jsonb_build_object('sub', id::text, 'email', email), 
  'email', 
  id::text, 
  now(), 
  now(), 
  now()
from auth.users
where email like 'staging-%@babinrentals.test';

commit;
