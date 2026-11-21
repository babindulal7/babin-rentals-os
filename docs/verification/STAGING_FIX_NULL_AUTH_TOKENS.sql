-- =============================================================================
-- STAGING_FIX_NULL_AUTH_TOKENS.sql
-- Fix GoTrue 500 "Database error querying schema" by converting NULL token
-- columns in auth.users to empty strings ('') while preserving phone uniqueness.
-- Project: klhmsrunqrdxjudyhnkm (babin-staging)
-- =============================================================================

begin;

-- 1. Reset any empty string phones to NULL to satisfy unique constraint
update auth.users
set phone = null
where phone = '';

-- 2. Ensure basic auth columns are populated
update auth.users
set 
  instance_id = '00000000-0000-0000-0000-000000000000',
  aud = 'authenticated',
  role = 'authenticated',
  encrypted_password = extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', array['email']),
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb),
  is_sso_user = false,
  updated_at = now()
where email like 'staging-%@babinrentals.test';

-- 3. Sweep all nullable token/change columns in auth.users (excluding phone and email)
do $$
declare
  col text;
begin
  for col in 
    select column_name 
    from information_schema.columns 
    where table_schema = 'auth' 
      and table_name = 'users' 
      and data_type in ('text', 'character varying')
      and is_nullable = 'YES'
      and column_name not in ('encrypted_password', 'email', 'phone')
  loop
    execute format('update auth.users set %I = '''' where %I is null and email like ''staging-%%%%@babinrentals.test''', col, col);
  end loop;
end $$;

commit;
