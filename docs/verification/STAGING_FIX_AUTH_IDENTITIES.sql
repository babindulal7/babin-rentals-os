-- =============================================================================
-- STAGING_FIX_AUTH_IDENTITIES.sql
-- Ensure auth.users and auth.identities are complete for GoTrue authentication
-- Project: klhmsrunqrdxjudyhnkm (babin-staging)
-- =============================================================================

begin;

-- 1. Ensure instance_id, aud, role and encrypted password on auth.users
update auth.users
set 
  instance_id = '00000000-0000-0000-0000-000000000000',
  aud = 'authenticated',
  role = 'authenticated',
  encrypted_password = extensions.crypt('StagingPass2026!', extensions.gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', array['email']),
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb),
  updated_at = now()
where email like 'staging-%@babinrentals.test';

-- 2. Ensure auth.identities exists for each user
do $$
declare
  r record;
begin
  for r in select id, email from auth.users where email like 'staging-%@babinrentals.test' loop
    if not exists (select 1 from auth.identities where user_id = r.id) then
      if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id') then
        execute 'insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) ' ||
                'values ($1, $2, $3, $4, $5, now(), now(), now())'
          using r.id, r.id, jsonb_build_object('sub', r.id::text, 'email', r.email), 'email', r.id::text;
      elsif exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'identities' and column_name = 'identity_data') then
        execute 'insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) ' ||
                'values ($1, $2, $3, $4, now(), now(), now())'
          using r.id, r.id, jsonb_build_object('sub', r.id::text, 'email', r.email), 'email';
      else
        execute 'insert into auth.identities (id, user_id, provider, created_at) ' ||
                'values ($1, $2, $3, now())'
          using r.id, r.id, 'email';
      end if;
    end if;
  end loop;
end $$;

commit;
