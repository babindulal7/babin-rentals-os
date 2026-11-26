import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../../../supabase/migrations/0270_email_rpc_least_privilege_and_disable_mock_payment_sends.sql', import.meta.url),
  'utf8',
)

describe('email RPC least-privilege migration (0270)', () => {
  it('requires server role for all privileged email RPCs', () => {
    const signatures = [
      'build_email_payload(text, uuid, text)',
      'record_email_send(text, text, uuid, text, text, text, text, text, jsonb)',
      'process_due_payment_reminders(integer)',
      'process_client_unsubscribe(text)',
    ]
    for (const signature of signatures) {
      expect(sql).toContain(`revoke execute on function public.${signature} from public, anon, authenticated;`)
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`)
    }
  })

  it('leaves due email reminders pending for a real provider worker', () => {
    expect(sql).toContain("elsif r.channel = 'email' then")
    expect(sql).toContain("until a separate, verified Resend outbox worker is approved")
    expect(sql).not.toMatch(/insert\s+into\s+public\.email_log\s*\(/i)
    expect(sql).not.toMatch(/set\s+status\s*=\s*'sent'/i)
    expect(sql).toContain("if r.channel = 'whatsapp_draft' then")
    expect(sql).toContain("and pr.channel = 'whatsapp_draft'")
  })
})
