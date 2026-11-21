-- =============================================================================
-- STAGING_ALIGN_NINE_ROLES.sql
-- Synchronize email addresses, passwords, and identities for the 9 staging roles
-- Target Project: klhmsrunqrdxjudyhnkm (babin-staging)
-- =============================================================================

begin;

-- 1. Standardize emails with 'staging-' prefix across auth.users
update auth.users set email = 'staging-owner@babinrentals.test' where id = 'a0000000-0000-4000-8000-000000000001';
update auth.users set email = 'staging-admin@babinrentals.test' where id = 'a0000000-0000-4000-8000-000000000002';
update auth.users set email = 'staging-manager@babinrentals.test' where id = 'a0000000-0000-4000-8000-000000000003';
update auth.users set email = 'staging-coordinator@babinrentals.test' where id = 'a0000000-0000-4000-8000-000000000004';
update auth.users set email = 'staging-warehouse@babinrentals.test' where id = 'a0000000-0000-4000-8000-000000000005';
update auth.users set email = 'staging-technician@babinrentals.test' where id = 'a0000000-0000-4000-8000-000000000006';
update auth.users set email = 'staging-accounts@babinrentals.test' where id = 'a0000000-0000-4000-8000-000000000007';
update auth.users set email = 'staging-driver@babinrentals.test' where id = 'a0000000-0000-4000-8000-000000000008';
update auth.users set email = 'staging-client@babinrentals.test' where id = 'a0000000-0000-4000-8000-000000000009';

-- 2. Update passwords & confirmations for all 9 seats
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
where id between 'a0000000-0000-4000-8000-000000000001' and 'a0000000-0000-4000-8000-000000000009';

-- 3. Delete old identities and re-insert with matching emails
delete from auth.identities 
where user_id between 'a0000000-0000-4000-8000-000000000001' and 'a0000000-0000-4000-8000-000000000009';

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
where id between 'a0000000-0000-4000-8000-000000000001' and 'a0000000-0000-4000-8000-000000000009';

-- 4. Sync public.users emails
update public.users u
set email = a.email
from auth.users a
where u.id = a.id and u.id between 'a0000000-0000-4000-8000-000000000001' and 'a0000000-0000-4000-8000-000000000008';

commit;
