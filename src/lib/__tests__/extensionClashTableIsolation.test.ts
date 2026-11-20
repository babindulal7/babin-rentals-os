import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/0241_extension_clash_manager_decision_and_at_risk.sql'),
  'utf8',
)

function selectPolicy(name: string): string {
  const text = sql.match(new RegExp(`create policy ${name} on [\\s\\S]*?;`, 'i'))?.[0]
  if (!text) throw new Error(`Missing SELECT RLS policy ${name}`)
  return text
}

describe('extension clash + booking at-risk role isolation (issue #223)', () => {
  it('requires role-based SELECT checks instead of authenticated USING (true)', () => {
    for (const name of ['extension_clash_decisions_select', 'booking_at_risk_select', 'client_account_credits_select']) {
      const policy = selectPolicy(name)
      expect(policy).toMatch(/for select to authenticated/i)
      expect(policy).toContain('auth_user_role()')
      expect(policy).not.toMatch(/using\s*\(\s*true\s*\)/i)
      expect(policy).not.toMatch(/['"]Client['"]/i)
    }
  })

  it('keeps clash decisions staff-controlled and risk visibility limited to operations roles', () => {
    expect(selectPolicy('extension_clash_decisions_select')).toContain("'Manager'")
    expect(selectPolicy('extension_clash_decisions_select')).not.toContain("'Driver'")
    const risk = selectPolicy('booking_at_risk_select')
    for (const role of ['Coordinator', 'Warehouse', 'Technician']) {
      expect(risk).toContain(`'${role}'`)
    }
    expect(risk).not.toContain("'Driver'")
    expect(risk).not.toContain("'Accounts'")
  })

  it('removes default browser-role writes and anon access on all 3 tables', () => {
    for (const table of ['extension_clash_decisions', 'booking_at_risk', 'client_account_credits']) {
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated;`)
      expect(sql).toContain(`grant select on table public.${table} to authenticated;`)
      expect(sql).not.toMatch(new RegExp(`grant (insert|update|delete|truncate|references|trigger) on (table )?public\\.${table}\\b`, 'i'))
    }
  })
  it('denies Coordinator credit/refund resolutions inside the SECURITY DEFINER RPC (P0)', () => {
    const start = sql.indexOf('create or replace function public.resolve_booking_at_risk(')
    expect(start).toBeGreaterThanOrEqual(0)
    const resolver = sql.slice(start)
    expect(resolver).toMatch(/v_role not in \('Owner', 'Admin', 'Manager', 'Coordinator'\)/)
    expect(resolver).toMatch(/v_resolution in \('credit', 'refund'\) or v_credit_amount > 0/)
    expect(resolver).toMatch(/v_role not in \('Owner', 'Admin', 'Manager'\)/)
    expect(resolver).toContain("using errcode = '42501'")
    const monetaryGuard = resolver.indexOf("v_resolution in ('credit', 'refund')")
    const firstRiskRead = resolver.indexOf('select * into v_row from public.booking_at_risk')
    expect(monetaryGuard).toBeGreaterThan(0)
    expect(firstRiskRead).toBeGreaterThan(monetaryGuard)
    // This is a source guard; PGlite behavioral and hosted JWT checks are separate.
  })

})
