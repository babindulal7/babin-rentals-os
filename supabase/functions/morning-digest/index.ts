// =============================================================================
// morning-digest/index.ts — Supabase Edge Function for Morning Digest (T5-04)
//
// Scheduled at 05:30 NPT (23:45 UTC) before the 06:00 operational day start (O-4).
//
// Features:
//   - Dispatches daily operational summary to active staff members.
//   - Uses operational day (06:00 → 06:00 NPT) query via RPC get_morning_digest.
//   - Enforces Law 6: money figures stripped for Warehouse, Technician, Driver, Client.
//   - Client templates are strictly English only (W80).
//   - Empty day fallback: sends "Nothing scheduled today" (not silence).
//   - Audited to email_log with NO email body (S13, W21).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DigestRequest {
  userId?: string
  targetDate?: string
  dryRun?: boolean
}

export function renderDigestHtml(digest: Record<string, unknown>, recipientName: string, recipientRole: string): string {
  const targetDate = String(digest.target_date ?? '')
  const bsDate = String(digest.bs_date ?? '')
  const canViewMoney = Boolean(digest.can_view_money)
  const emptyMessage = String(digest.empty_message ?? 'Nothing scheduled today')
  const hasScheduledItems = Boolean(digest.has_scheduled_items)

  const pickups = Array.isArray(digest.pickups) ? (digest.pickups as Array<Record<string, unknown>>) : []
  const returns = Array.isArray(digest.returns) ? (digest.returns as Array<Record<string, unknown>>) : []
  const overdue = Array.isArray(digest.overdue) ? (digest.overdue as Array<Record<string, unknown>>) : []
  const openDamage = Array.isArray(digest.open_damage) ? (digest.open_damage as Array<Record<string, unknown>>) : []
  const shiftHandovers = Array.isArray(digest.shift_handovers) ? (digest.shift_handovers as Array<Record<string, unknown>>) : []
  const paymentsDue = Array.isArray(digest.payments_due) ? (digest.payments_due as Array<Record<string, unknown>>) : []

  const pickupsList = pickups.length > 0
    ? `<ul style="margin:8px 0;padding-left:20px;font-size:14px;line-height:1.6;">${pickups
        .map((p) => `<li><strong>${String(p.booking_no ?? '')}</strong> — ${String(p.pickup_time ?? '06:00')} · ${String(p.client_name ?? 'Client')} (${String(p.delivery_type ?? 'Pickup')})</li>`)
        .join('')}</ul>`
    : `<p style="margin:4px 0;color:#64748b;font-size:14px;font-style:italic;">None scheduled</p>`

  const returnsList = returns.length > 0
    ? `<ul style="margin:8px 0;padding-left:20px;font-size:14px;line-height:1.6;">${returns
        .map((r) => `<li><strong>${String(r.booking_no ?? '')}</strong> — ${String(r.return_time ?? '20:00')} · ${String(r.client_name ?? 'Client')}</li>`)
        .join('')}</ul>`
    : `<p style="margin:4px 0;color:#64748b;font-size:14px;font-style:italic;">None scheduled</p>`

  const overdueList = overdue.length > 0
    ? `<ul style="margin:8px 0;padding-left:20px;font-size:14px;line-height:1.6;color:#b91c1c;">${overdue
        .map((o) => `<li><strong>${String(o.booking_no ?? '')}</strong> — ${String(o.days_overdue ?? 1)} day(s) overdue · ${String(o.client_name ?? 'Client')}</li>`)
        .join('')}</ul>`
    : `<p style="margin:4px 0;color:#64748b;font-size:14px;font-style:italic;">None overdue</p>`

  const damageList = openDamage.length > 0
    ? `<ul style="margin:8px 0;padding-left:20px;font-size:14px;line-height:1.6;">${openDamage
        .map((d) => {
          const paisa = typeof d.estimated_cost_paisa === 'number' ? d.estimated_cost_paisa : null
          const costStr = canViewMoney && paisa != null ? ` · Estimated: Rs ${(paisa / 100).toLocaleString()}` : ''
          return `<li><strong>${String(d.damage_type ?? 'Damage')}</strong> (${String(d.severity ?? 'Notice')}) — ${String(d.description ?? '')}${costStr}</li>`
        })
        .join('')}</ul>`
    : `<p style="margin:4px 0;color:#64748b;font-size:14px;font-style:italic;">None open</p>`

  const handoversList = shiftHandovers.length > 0
    ? `<ul style="margin:8px 0;padding-left:20px;font-size:14px;line-height:1.6;">${shiftHandovers
        .map((h) => `<li><strong>Shift ${String(h.shift_code ?? 'A')}</strong> from ${String(h.from_user_name ?? 'Staff')}: ${String(h.notes ?? 'Pending acknowledgement')}</li>`)
        .join('')}</ul>`
    : `<p style="margin:4px 0;color:#64748b;font-size:14px;font-style:italic;">None pending</p>`

  const paymentsBlock = canViewMoney
    ? `
      <div style="margin-top:20px;">
        <h3 style="margin:0 0 8px;font-size:15px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">Payments Due Today (${paymentsDue.length})</h3>
        ${paymentsDue.length > 0
          ? `<ul style="margin:8px 0;padding-left:20px;font-size:14px;line-height:1.6;">${paymentsDue
              .map((pm) => {
                const paisa = typeof pm.outstanding_paisa === 'number' ? pm.outstanding_paisa : 0
                return `<li><strong>${String(pm.invoice_no ?? '')}</strong> — ${String(pm.client_name ?? 'Client')}: Rs ${(paisa / 100).toLocaleString()} (Due: ${String(pm.due_date ?? '')})</li>`
              })
              .join('')}</ul>`
          : `<p style="margin:4px 0;color:#64748b;font-size:14px;font-style:italic;">None due today</p>`}
      </div>
    `
    : ''

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Babin Rentals — Morning Digest</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; background-color: #f8fafc; color: #1e293b; }
        .container { max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        .header { background: #0f172a; padding: 24px; color: #ffffff; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
        .header p { margin: 4px 0 0; font-size: 13px; color: #94a3b8; }
        .body { padding: 32px 24px; line-height: 1.6; font-size: 15px; }
        .footer { padding: 20px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Babin Rentals</h1>
          <p>Morning Operational Digest · Kathmandu, Nepal</p>
        </div>
        <div class="body">
          <p>Good morning, ${recipientName}${recipientRole ? ` (${recipientRole})` : ''}.</p>
          <p style="margin-top:4px;color:#64748b;font-size:14px;">Operational Day: <strong>${bsDate ? `${bsDate} · ` : ''}${targetDate}</strong> (06:00 → 06:00 NPT)</p>

          ${!hasScheduledItems
            ? `<div style="background:#f8fafc;border:1px dashed #cbd5e1;padding:24px;border-radius:8px;text-align:center;margin:20px 0;">
                <p style="margin:0;font-size:16px;font-weight:600;color:#475569;">${emptyMessage}</p>
                <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">No movements, overdue returns, open damage, or pending shift handovers scheduled for today.</p>
              </div>`
            : `
              <div style="margin-top:20px;">
                <h3 style="margin:0 0 8px;font-size:15px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">Today's Pickups (${pickups.length})</h3>
                ${pickupsList}
              </div>

              <div style="margin-top:20px;">
                <h3 style="margin:0 0 8px;font-size:15px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">Today's Returns (${returns.length})</h3>
                ${returnsList}
              </div>

              <div style="margin-top:20px;">
                <h3 style="margin:0 0 8px;font-size:15px;color:#b91c1c;border-bottom:1px solid #fecaca;padding-bottom:4px;">Overdue Returns (${overdue.length})</h3>
                ${overdueList}
              </div>

              <div style="margin-top:20px;">
                <h3 style="margin:0 0 8px;font-size:15px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">Open Damage Cases (${openDamage.length})</h3>
                ${damageList}
              </div>

              <div style="margin-top:20px;">
                <h3 style="margin:0 0 8px;font-size:15px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">Pending Shift Handovers (${shiftHandovers.length})</h3>
                ${handoversList}
              </div>

              ${paymentsBlock}
            `}
        </div>
        <div class="footer">
          <p style="margin: 0;">Sent automatically from <strong>no-reply@babinrentals.com</strong>.</p>
          <p style="margin: 4px 0 0;">Babin Rentals OS · New Baneshwor, Kathmandu · +977-1-4780000</p>
        </div>
      </div>
    </body>
    </html>
  `.trim()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    // Parse options from body if present
    let body: DigestRequest = {}
    if (req.method === 'POST') {
      try {
        body = await req.json()
      } catch {
        body = {}
      }
    }

    // Determine target users to send digest to
    let staffQuery = adminClient
      .from('users')
      .select('id, email, full_name, primary_role')
      .not('primary_role', 'in', '("client","Client")')

    if (body.userId) {
      staffQuery = staffQuery.eq('id', body.userId)
    }

    const { data: staffMembers, error: staffError } = await staffQuery

    if (staffError) {
      return new Response(JSON.stringify({ error: 'Failed to query staff users', detail: staffError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const results: Array<Record<string, unknown>> = []

    for (const staff of (staffMembers || [])) {
      if (!staff.email) continue

      // Check user preferences: skip if user has opted out of morning_digest email (T5-05)
      const { data: prefRow } = await adminClient
        .from('notification_preferences')
        .select('email_enabled')
        .eq('user_id', staff.id)
        .eq('notification_type', 'morning_digest')
        .maybeSingle()

      if (prefRow && prefRow.email_enabled === false) {
        results.push({ userId: staff.id, email: staff.email, status: 'skipped_opted_out' })
        continue
      }

      // RPC get_morning_digest calculates operational day bounds and filters by Law 6
      const { data: digest, error: digestErr } = await adminClient.rpc('get_morning_digest', {
        p_user_id: staff.id,
        p_target_date: body.targetDate || null,
      })

      if (digestErr || !digest) {
        results.push({ userId: staff.id, email: staff.email, status: 'error', error: digestErr?.message })
        continue
      }

      const targetDate = digest.target_date || new Date().toISOString().slice(0, 10)
      const subject = `[Babin Rentals] Morning Digest — ${targetDate} AD`
      const emailHtml = renderDigestHtml(digest, staff.full_name || 'Staff', staff.primary_role || '')

      let dispatchStatus = 'mock_sent'
      let dispatchError: string | null = null

      if (!body.dryRun && resendApiKey) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: 'Babin Rentals <no-reply@babinrentals.com>',
              to: [staff.email],
              subject,
              html: emailHtml,
            }),
          })

          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}))
            dispatchStatus = 'failed'
            dispatchError = String(errJson.message || `Provider responded with HTTP ${res.status}`)
          } else {
            dispatchStatus = 'sent'
          }
        } catch (err: unknown) {
          dispatchStatus = 'failed'
          dispatchError = err instanceof Error ? err.message : String(err)
        }
      }

      // Record send to audit log (Law 3, Law 4, S13, W21: NO body recorded)
      let logId: string | null = null
      if (!body.dryRun) {
        const { data: recordedId } = await adminClient.rpc('record_email_send', {
          p_template_id: 'morning_digest',
          p_recipient_email: staff.email,
          p_recipient_user_id: staff.id,
          p_entity_type: 'digest',
          p_entity_id: String(targetDate),
          p_status: dispatchStatus,
          p_error_message: dispatchError,
          p_language: 'en',
          p_metadata: {
            can_view_money: digest.can_view_money,
            total_items: digest.total_items_count,
            has_scheduled_items: digest.has_scheduled_items,
          },
        })
        logId = recordedId
      }

      results.push({
        userId: staff.id,
        email: staff.email,
        role: staff.primary_role,
        canViewMoney: digest.can_view_money,
        status: dispatchStatus,
        logId,
      })
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
