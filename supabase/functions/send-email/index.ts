// =============================================================================
// send-email/index.ts — Supabase Edge Function for transactional emails (T5-03)
//
// Features:
//   - Dispatches transactional emails via configured email provider (Resend, Postmark, etc.)
//   - Falls back gracefully to mock sending when no API key is provided (local dev / staging)
//   - Builds message server-side via database RPC (stops browser forging, Law 1)
//   - Money blindness (Law 6): zero money figures for money-blind roles (Warehouse, Technician, Driver, Client)
//   - English only for clients (W80)
//   - Never logs email bodies to email_log (S13, W21)
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SendEmailRequest {
  templateId: string
  recipientUserId?: string
  recipientEmail?: string
  entityType?: string
  entityId?: string
  language?: string
}

interface EmailPayloadData {
  template_id: string
  recipient_email: string
  recipient_name: string
  subject: string
  data: Record<string, unknown>
}

export function renderEmailHtml(payload: EmailPayloadData, language = 'en'): string {
  const { recipient_name, subject, template_id, data } = payload

  let mainBody = ''
  switch (template_id) {
    case 'pickup_reminder':
      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>This is a reminder that your rental gear for booking <strong>${data.booking_no || ''}</strong> is ready for pickup.</p>
        <div style="background:#f4f5f7;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Pickup Time:</strong> ${data.start_date || 'As scheduled'}</p>
          <p style="margin:4px 0;"><strong>Return Scheduled:</strong> ${data.end_date || 'As scheduled'}</p>
        </div>
        <p>Please remember to bring your valid government-issued ID for verification at handover.</p>
      `
      break

    case 'pickup_receipt':
      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>Your gear handover has been completed for booking <strong>${data.booking_no || ''}</strong>.</p>
        <div style="background:#f4f5f7;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Handover Completed:</strong> ${data.start_date || 'Today'}</p>
          <p style="margin:4px 0;"><strong>Return Scheduled:</strong> ${data.end_date || 'As scheduled'}</p>
        </div>
        <p>Please ensure all accessories and cables are returned together at the end of the rental period.</p>
      `
      break

    case 'return_reminder':
      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>This is a gentle reminder that booking <strong>${data.booking_no || ''}</strong> is scheduled for return today.</p>
        <div style="background:#f4f5f7;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Scheduled Return:</strong> ${data.end_date || 'Today'}</p>
        </div>
        <p>Please return all items clean and complete to complete the return process smoothly.</p>
      `
      break

    case 'late_return':
      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p style="color:#b91c1c;font-weight:600;">URGENT: Return Overdue</p>
        <p>The scheduled return window for booking <strong>${data.booking_no || ''}</strong> has elapsed (grace period ended).</p>
        <p>Please bring the equipment to our Kathmandu store immediately or contact our coordination team.</p>
      `
      break

    case 'return_receipt':
      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>Your equipment return for booking <strong>${data.booking_no || ''}</strong> has been processed.</p>
        <div style="background:#f4f5f7;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Return Processed:</strong> ${data.return_date || 'Today'}</p>
          <p style="margin:4px 0;"><strong>Condition Status:</strong> ${data.inspection_summary || (data.has_flagged_items ? 'Returned with items flagged for review' : 'All items returned in good order')}</p>
        </div>
        ${data.has_flagged_items ? '<p style="color:#b45309;">Flagged items are currently under review by our technical team. You will be notified once assessment is completed.</p>' : ''}
        <p>Thank you for choosing Babin Rentals.</p>
      `
      break

    case 'damage_notice':
      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>During the return inspection for booking <strong>${data.booking_no || ''}</strong>, our technician identified an item requiring review.</p>
        <div style="background:#fef2f2;border:1px solid #fee2e2;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;color:#991b1b;"><strong>Status:</strong> Under Technical Review</p>
          <p style="margin:4px 0;">Our workshop is assessing the equipment. No charges are applied until formal review is concluded.</p>
        </div>
        <p>We will contact you with any further updates once assessment completes.</p>
      `
      break

    case 'damage_charge':
      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>Following technical review of booking <strong>${data.booking_no || ''}</strong>, the assessment for damaged/missing equipment has been finalized and approved.</p>
        <div style="background:#fef2f2;border:1px solid #fee2e2;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Resolution:</strong> ${data.description || data.damage_type || 'Approved Assessment'}</p>
          <p style="margin:4px 0;"><strong>Approved Charge:</strong> ${data.charge_amount_display || (data.approved_amount ? `Rs ${data.approved_amount}` : 'Please contact store for invoice details.')}</p>
        </div>
        <p>An updated invoice or statement reflecting this approved charge has been generated for your account.</p>
      `
      break

    case 'payment_reminder':
      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>This is a payment reminder regarding the outstanding balance on completed rental <strong>${data.booking_no || ''}</strong>.</p>
        <div style="background:#fef2f2;border:1px solid #fee2e2;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;color:#991b1b;font-size:16px;"><strong>Outstanding Balance:</strong> ${data.outstanding_display || (data.outstanding_amount_display || (data.outstanding_amount ? `Rs ${data.outstanding_amount}` : 'Please contact store for invoice details.'))}</p>
          <p style="margin:4px 0;font-size:13px;color:#64748b;">Reminder #${(Number(data.sequence) || 0) + 1} · Please clear the balance at your earliest convenience.</p>
        </div>
        <p>Payment can be made via bank transfer, Fonepay / QR, or in person at our Kathmandu store.</p>
        <div style="margin:20px 0;">
          <a href="${data.statement_url || `https://app.babinrentals.com/rentals/${data.booking_id || ''}`}" style="background:#1e293b;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">View Statement</a>
        </div>
        <p>If you have already settled this balance, please disregard this reminder or send us your payment receipt so our accounts team can reconcile it immediately.</p>
      `
      break

    case 'test_template':
      mainBody = `
        <p>Hello ${recipient_name},</p>
        <p>This is a verified test email from the Babin Rentals notification service.</p>
        <p style="color:#15803d;">System health and SMTP dispatch are functioning normally.</p>
      `
      break

    default:
      mainBody = `
        <p>Hello ${recipient_name},</p>
        <p>You have a new update regarding your rental account.</p>
      `
      break
  }

  return `
    <!DOCTYPE html>
    <html lang="${language}">
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
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
          <p>Professional Cinema & Audio Gear · Kathmandu, Nepal</p>
        </div>
        <div class="body">
          ${mainBody}
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

export async function handleSendEmail(req: Request): Promise<Response> {
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

    // Authenticate user with anon client
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: SendEmailRequest = await req.json()
    const { templateId, recipientUserId, recipientEmail, entityType, entityId, language = 'en' } = body

    if (!templateId) {
      return new Response(JSON.stringify({ error: 'Missing templateId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Service role client for database lookups and logging
    const adminClient = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

    // Verify caller role and anti-forgery:
    // If caller is Client, they cannot send emails addressed to other users
    const { data: callerUser } = await adminClient
      .from('users')
      .select('id, primary_role')
      .eq('id', user.id)
      .single()

    const isClient = callerUser?.primary_role === 'Client'
    if (isClient && recipientUserId && recipientUserId !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden: cannot send email for another user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build email payload server-side using RPC (stops client forging)
    const { data: payload, error: rpcError } = await adminClient.rpc('build_email_payload', {
      p_template_id: templateId,
      p_recipient_user_id: recipientUserId || (isClient ? user.id : null),
      p_entity_id: entityId || null,
    })

    if (rpcError || !payload) {
      return new Response(JSON.stringify({ error: 'Failed to build email payload', detail: rpcError?.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const targetEmail = recipientEmail || payload.recipient_email || user.email
    if (!targetEmail) {
      return new Response(JSON.stringify({ error: 'No recipient email resolved' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const emailHtml = renderEmailHtml(payload, language)
    const subject = payload.subject || 'Notification from Babin Rentals'

    // Dispatch via Provider (e.g. Resend) or Mock
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    let dispatchStatus = 'mock_sent'
    let dispatchError: string | null = null

    if (resendApiKey) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: 'Babin Rentals <no-reply@babinrentals.com>',
            to: [targetEmail],
            subject,
            html: emailHtml,
          }),
        })

        if (!res.ok) {
          const errText = await res.text()
          dispatchStatus = 'failed'
          dispatchError = `Resend error: ${errText}`
        } else {
          dispatchStatus = 'sent'
        }
      } catch (err) {
        dispatchStatus = 'failed'
        dispatchError = err instanceof Error ? err.message : String(err)
      }
    } else {
      // Mock mode for local dev / staging without active key
      dispatchStatus = 'mock_sent'
    }

    // Audit log send (strictly NO email body stored per S13 / W21)
    const { data: logId, error: logError } = await adminClient.rpc('record_email_send', {
      p_template_id: templateId,
      p_recipient_email: targetEmail,
      p_recipient_user_id: recipientUserId || user.id,
      p_entity_type: entityType || null,
      p_entity_id: entityId || null,
      p_status: dispatchStatus,
      p_error: dispatchError,
      p_language: language,
      p_metadata: { subject, provider: resendApiKey ? 'resend' : 'mock' },
    })

    if (logError) {
      console.error('Failed to log email send:', logError)
    }

    return new Response(
      JSON.stringify({
        success: dispatchStatus !== 'failed',
        status: dispatchStatus,
        emailLogId: logId,
        recipientEmail: targetEmail,
        error: dispatchError,
      }),
      {
        status: dispatchStatus === 'failed' ? 500 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown internal error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
}

// Serve function if running under Deno runtime
if (import.meta.main) {
  Deno.serve(handleSendEmail)
}
