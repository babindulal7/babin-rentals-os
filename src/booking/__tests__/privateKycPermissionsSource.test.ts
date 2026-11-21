import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Source-level guard for the migration; privacy acceptance additionally
// requires role-scoped Supabase Storage / PostgREST runtime tests.
const sql = readFileSync(
  new URL('../../../supabase/migrations/0247_client_accounts_and_portal_binding.sql', import.meta.url),
  'utf8',
)
const staffSelect = sql.split('create policy online_profiles_staff_select on public.online_profiles')[1]
  ?.split('-- 2. View public.online_profiles_v')[0] ?? ''
const profileView = sql.split('create or replace view public.online_profiles_v as')[1]
  ?.split('comment on view public.online_profiles_v')[0] ?? ''
const objectSelect = sql.split('create policy "request_ids_select"')[1]
  ?.split('-- 4. RPC online_profile_save')[0] ?? ''
const deskRoles = /public\.auth_user_role\(\) in \('Owner', 'Admin', 'Manager', 'Coordinator'\)/

describe('T7-03 sensitive client ID document isolation', () => {
  it('restricts direct profile table reads to approved online desk staff or owner', () => {
    expect(staffSelect).toMatch(deskRoles)
    expect(staffSelect).not.toMatch(/auth_is_staff\(\)/)
    expect(sql).toMatch(/auth_uid = auth\.uid\(\)/)
  })

  it('prevents a definer view from making all client profiles visible to floor staff', () => {
    expect(profileView).toMatch(deskRoles)
    expect(profileView).toMatch(/op\.auth_uid = auth\.uid\(\)/)
    expect(profileView).not.toMatch(/auth_is_staff\(\)/)
  })

  it('replaces broad KYC storage SELECT with client-folder or desk-role permission', () => {
    expect(sql).toMatch(/drop policy if exists "request_ids_select" on storage\.objects/)
    expect(objectSelect).toMatch(/bucket_id = 'request-ids'/)
    expect(objectSelect).toMatch(/auth\.uid\(\) is not null/)
    expect(objectSelect).toMatch(/\(string_to_array\(name, '\/'\)\)\[1\] = auth\.uid\(\)::text/)
    expect(objectSelect).toMatch(deskRoles)
    expect(objectSelect).not.toMatch(/auth_is_staff\(\)/)
  })
})
