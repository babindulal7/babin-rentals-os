import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Static source guard only: role and tenant behavior still requires PGlite and
// approved synthetic hosted PostgREST acceptance before this can be marked done.
const migration = readFileSync(
  new URL('../../../supabase/migrations/0257_client_accounts_and_portal_binding.sql', import.meta.url),
  'utf8',
)
const viewDefinition = migration.match(
  /create or replace view public\.booking_requests_v as([\s\S]*?)revoke all on public\.booking_requests_v/i,
)?.[1] ?? ''

describe('T7 request-view authorization source guard', () => {
  it('requires an explicit staff-or-own-client row predicate on the exposed view', () => {
    expect(viewDefinition).toMatch(/from public\.booking_requests r\s+where public\.auth_user_role\(\) in/i)
    expect(viewDefinition).toMatch(/'Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'/)
    expect(viewDefinition).toMatch(/public\.auth_user_role\(\) = 'Client'/)
    expect(viewDefinition).toMatch(/r\.requester_auth_uid = auth\.uid\(\)/)
  })

  it('does not grant anonymous SELECT access to the request view', () => {
    expect(migration).toMatch(/revoke all on public\.booking_requests_v from public, anon/i)
    expect(migration).toMatch(/grant select on public\.booking_requests_v to authenticated/i)
  })
})
