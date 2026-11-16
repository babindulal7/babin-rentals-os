/**
 * Email template renderers (T5-03).
 *
 * Rules:
 *   - Client templates are strictly English only (W80).
 *   - Money blindness (Law 6): zero money figures for money-blind roles (Warehouse, Technician, Driver, Client).
 *   - Professional, accessible HTML email layout with Babin Rentals branding.
 */

export interface EmailPayloadData {
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
        <p>This is a reminder that your rental gear for booking <strong>${String(data['booking_no'] ?? '')}</strong> is ready for pickup.</p>
        <div style="background:#f4f5f7;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Pickup Time:</strong> ${String(data['start_date'] ?? 'As scheduled')}</p>
          <p style="margin:4px 0;"><strong>Return Scheduled:</strong> ${String(data['end_date'] ?? 'As scheduled')}</p>
        </div>
        <p>Please remember to bring your valid government-issued ID for verification at handover.</p>
      `
      break

    case 'pickup_receipt':
      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>Your gear handover has been completed for booking <strong>${String(data['booking_no'] ?? '')}</strong>.</p>
        <div style="background:#f4f5f7;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Handover Completed:</strong> ${String(data['start_date'] ?? 'Today')}</p>
          <p style="margin:4px 0;"><strong>Return Scheduled:</strong> ${String(data['end_date'] ?? 'As scheduled')}</p>
        </div>
        <p>Please ensure all accessories and cables are returned together at the end of the rental period.</p>
      `
      break

    case 'return_reminder':
      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>This is a gentle reminder that booking <strong>${String(data['booking_no'] ?? '')}</strong> is scheduled for return today.</p>
        <div style="background:#f4f5f7;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Scheduled Return:</strong> ${String(data['end_date'] ?? 'Today')}</p>
        </div>
        <p>Please return all items clean and complete to complete the return process smoothly.</p>
      `
      break

    case 'late_return':
      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p style="color:#b91c1c;font-weight:600;">URGENT: Return Overdue</p>
        <p>The scheduled return window for booking <strong>${String(data['booking_no'] ?? '')}</strong> has elapsed (grace period ended).</p>
        <p>Please bring the equipment to our Kathmandu store immediately or contact our coordination team.</p>
      `
      break

    case 'return_receipt':
      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>Your equipment return has been received for booking <strong>${String(data['booking_no'] ?? '')}</strong>.</p>
        <div style="background:#f4f5f7;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Returned:</strong> ${String(data['return_date'] ?? 'Today')}</p>
          <p style="margin:4px 0;"><strong>Condition Status:</strong> ${String(data['inspection_summary'] ?? 'Inspection complete. Any missing or damaged items are placed under technical review.')}</p>
        </div>
        <p>Thank you for renting with Babin Rentals.</p>
      `
      break

    case 'damage_notice':
      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>During the return inspection for booking <strong>${String(data['booking_no'] ?? '')}</strong>, our technician identified an item requiring review.</p>
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
        <p>Following technical review of booking <strong>${String(data['booking_no'] ?? '')}</strong>, the assessment for damaged/missing equipment has been finalized and approved.</p>
        <div style="background:#fef2f2;border:1px solid #fee2e2;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Resolution:</strong> Approved Assessment</p>
          <p style="margin:4px 0;"><strong>Approved Charge:</strong> ${String(data['charge_amount_display'] ?? 'Please contact store for invoice details.')}</p>
        </div>
        <p>An updated invoice or statement reflecting this approved charge has been generated for your account.</p>
      `
      break

    case 'payment_reminder':
      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>This is a payment reminder regarding the outstanding balance on completed rental <strong>${String(data['booking_no'] ?? '')}</strong>.</p>
        <div style="background:#fef2f2;border:1px solid #fee2e2;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;color:#991b1b;font-size:16px;"><strong>Outstanding Balance:</strong> ${String(data['outstanding_display'] ?? (data['outstanding_amount_display'] ?? 'Rs. ' + String(data['outstanding_amount'] ?? '0')))}</p>
          <p style="margin:4px 0;font-size:13px;color:#64748b;">Reminder #${String(Number(data['sequence'] ?? 0) + 1)} · Please clear the balance at your earliest convenience.</p>
        </div>
        <p>Payment can be made via bank transfer, Fonepay / QR, or in person at our Kathmandu store.</p>
        <div style="margin:20px 0;">
          <a href="${String(data['statement_url'] ?? `https://app.babinrentals.com/rentals/${String(data['booking_id'] ?? '')}`)}" style="background:#1e293b;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">View Statement</a>
        </div>
        <p>If you have already settled this balance, please disregard this reminder or send us your payment receipt so our accounts team can reconcile it immediately.</p>
      `
      break

    case 'morning_digest': {
      const recipientRole = String(data['role'] ?? '')
      const targetDate = String(data['target_date'] ?? '')
      const bsDate = String(data['bs_date'] ?? '')
      const canViewMoney = Boolean(data['can_view_money'])
      const emptyMessage = data['empty_message'] ? String(data['empty_message']) : 'Nothing scheduled today'
      const hasScheduledItems = Boolean(data['has_scheduled_items'])

      const pickups = Array.isArray(data['pickups']) ? (data['pickups'] as Array<Record<string, unknown>>) : []
      const returns = Array.isArray(data['returns']) ? (data['returns'] as Array<Record<string, unknown>>) : []
      const overdue = Array.isArray(data['overdue']) ? (data['overdue'] as Array<Record<string, unknown>>) : []
      const openDamage = Array.isArray(data['open_damage'])
        ? (data['open_damage'] as Array<Record<string, unknown>>)
        : Array.isArray(data['openDamage'])
          ? (data['openDamage'] as Array<Record<string, unknown>>)
          : []
      const shiftHandovers = Array.isArray(data['shift_handovers'])
        ? (data['shift_handovers'] as Array<Record<string, unknown>>)
        : Array.isArray(data['shiftHandovers'])
          ? (data['shiftHandovers'] as Array<Record<string, unknown>>)
          : []
      const paymentsDue = Array.isArray(data['payments_due'])
        ? (data['payments_due'] as Array<Record<string, unknown>>)
        : Array.isArray(data['paymentsDue'])
          ? (data['paymentsDue'] as Array<Record<string, unknown>>)
          : []

      const greeting = `Good morning, ${recipient_name}${recipientRole ? ` (${recipientRole})` : ''}`

      if (!hasScheduledItems) {
        mainBody = `
          <p>${greeting}.</p>
          <div style="background:#f1f5f9;border:1px solid #cbd5e1;padding:20px;border-radius:8px;margin:16px 0;text-align:center;">
            <p style="margin:0;font-size:16px;font-weight:600;color:#475569;">${emptyMessage}</p>
            <p style="margin:4px 0 0;font-size:13px;color:#64748b;">All stations clear for operational day ${targetDate}${bsDate ? ` (${bsDate})` : ''}.</p>
          </div>
        `
      } else {
        const pickupsList = pickups.length > 0
          ? `<ul style="margin:8px 0;padding-left:20px;font-size:14px;line-height:1.6;">${pickups
              .map((p) => `<li><strong>${String(p['booking_no'] ?? '')}</strong> — ${String(p['pickup_time'] ?? '06:00')} · ${String(p['client_name'] ?? 'Client')} (${String(p['delivery_type'] ?? 'Store Pickup')})</li>`)
              .join('')}</ul>`
          : `<p style="margin:4px 0;color:#64748b;font-size:14px;font-style:italic;">None scheduled</p>`

        const returnsList = returns.length > 0
          ? `<ul style="margin:8px 0;padding-left:20px;font-size:14px;line-height:1.6;">${returns
              .map((r) => `<li><strong>${String(r['booking_no'] ?? '')}</strong> — ${String(r['return_time'] ?? '20:00')} · ${String(r['client_name'] ?? 'Client')}</li>`)
              .join('')}</ul>`
          : `<p style="margin:4px 0;color:#64748b;font-size:14px;font-style:italic;">None scheduled</p>`

        const overdueList = overdue.length > 0
          ? `<ul style="margin:8px 0;padding-left:20px;font-size:14px;line-height:1.6;color:#b91c1c;">${overdue
              .map((o) => `<li><strong>${String(o['booking_no'] ?? '')}</strong> — ${String(o['days_overdue'] ?? 1)} day(s) overdue · ${String(o['client_name'] ?? 'Client')}</li>`)
              .join('')}</ul>`
          : `<p style="margin:4px 0;color:#64748b;font-size:14px;font-style:italic;">None overdue</p>`

        const damageList = openDamage.length > 0
          ? `<ul style="margin:8px 0;padding-left:20px;font-size:14px;line-height:1.6;">${openDamage
              .map((d) => {
                const paisa = typeof d['estimated_cost_paisa'] === 'number' ? d['estimated_cost_paisa'] : null
                const costStr = canViewMoney && paisa != null ? ` · Est: Rs. ${(paisa / 100).toLocaleString('en-IN')}` : ''
                return `<li><strong>${String(d['damage_type'] ?? 'Damage')}</strong> (${String(d['severity'] ?? 'Notice')}) — ${String(d['description'] ?? '')}${costStr}</li>`
              })
              .join('')}</ul>`
          : `<p style="margin:4px 0;color:#64748b;font-size:14px;font-style:italic;">None open</p>`

        const handoversList = shiftHandovers.length > 0
          ? `<ul style="margin:8px 0;padding-left:20px;font-size:14px;line-height:1.6;">${shiftHandovers
              .map((h) => `<li><strong>Shift ${String(h['shift_code'] ?? 'A')}</strong> (${String(h['shift_date'] ?? '')}) from ${String(h['from_user_name'] ?? 'Staff')}: ${String(h['notes'] ?? 'Pending acknowledgement')}</li>`)
              .join('')}</ul>`
          : `<p style="margin:4px 0;color:#64748b;font-size:14px;font-style:italic;">None pending</p>`

        const paymentsBlock = canViewMoney && paymentsDue.length > 0
          ? `
            <div style="margin-top:20px;">
              <h3 style="margin:0 0 8px;font-size:15px;color:#15803d;border-bottom:1px solid #dcfce7;padding-bottom:4px;">Payments Due Today (${paymentsDue.length})</h3>
              <ul style="margin:8px 0;padding-left:20px;font-size:14px;line-height:1.6;">${paymentsDue
                .map((pm) => {
                  const paisa = typeof pm['outstanding_paisa'] === 'number' ? pm['outstanding_paisa'] : 0
                  return `<li><strong>${String(pm['invoice_no'] ?? '')}</strong> — ${String(pm['client_name'] ?? 'Client')}: Rs. ${(paisa / 100).toLocaleString('en-IN')} due</li>`
                })
                .join('')}</ul>
            </div>
          `
          : ''

        mainBody = `
          <p>${greeting}.</p>
          <p style="margin-top:4px;color:#64748b;font-size:14px;">Operational Day: <strong>${bsDate ? `${bsDate} · ` : ''}${targetDate}</strong> (06:00 → 06:00 NPT)</p>

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
        `
      }
      break
    }

    case 'booking_confirmation': {
      const bookingNo = String(data['booking_no'] ?? '')
      const startDate = String(data['start_date'] ?? 'As scheduled')
      const endDate = String(data['end_date'] ?? 'As scheduled')
      const itemsCount = String(data['items_count'] ?? '')
      const totalDisplay = data['total_display'] ? String(data['total_display']) : null
      const pickupTime = String(data['pickup_time'] ?? '10:00 AM')

      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>Your equipment rental reservation with <strong>Babin Rentals</strong> has been confirmed. ✅</p>
        <div style="background:#f4f5f7;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Booking Reference:</strong> ${bookingNo}</p>
          <p style="margin:4px 0;"><strong>Rental Period:</strong> ${startDate} → ${endDate}</p>
          <p style="margin:4px 0;"><strong>Pickup Window:</strong> From ${pickupTime} at our store</p>
          ${itemsCount ? `<p style="margin:4px 0;"><strong>Reserved Gear:</strong> ${itemsCount} item(s)</p>` : ''}
          ${totalDisplay ? `<p style="margin:4px 0;font-weight:700;color:#0f172a;"><strong>Rental Total:</strong> ${totalDisplay}</p>` : ''}
        </div>
        <p><strong>Reminder:</strong> Please present a valid government-issued photo ID (Citizenship, Passport, or Driving License) during handover.</p>
      `
      break
    }

    case 'quote_document': {
      const bookingNo = String(data['booking_no'] ?? '')
      const quoteNo = String(data['quote_no'] ?? bookingNo)
      const startDate = String(data['start_date'] ?? 'As scheduled')
      const endDate = String(data['end_date'] ?? 'As scheduled')
      const totalDisplay = data['total_display'] ? String(data['total_display']) : null

      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>Please find the commercial quotation for your requested rental reservation with Babin Rentals.</p>
        <div style="background:#f4f5f7;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Quotation Reference:</strong> ${quoteNo}</p>
          <p style="margin:4px 0;"><strong>Booking:</strong> ${bookingNo}</p>
          <p style="margin:4px 0;"><strong>Requested Duration:</strong> ${startDate} → ${endDate}</p>
          ${totalDisplay ? `<p style="margin:4px 0;font-weight:700;color:#0f172a;"><strong>Estimated Total (incl. 13% VAT):</strong> ${totalDisplay}</p>` : ''}
        </div>
        <p>To confirm this quotation and lock in equipment availability, please reply to this email or contact our desk.</p>
      `
      break
    }

    case 'invoice_document': {
      const invoiceNo = String(data['invoice_no'] ?? '')
      const bookingNo = String(data['booking_no'] ?? '')
      const totalDisplay = data['total_display'] ? String(data['total_display']) : null
      const balanceDisplay = data['balance_display'] ? String(data['balance_display']) : null

      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>Please find attached the official Tax Invoice for your rental account with Babin Rentals.</p>
        <div style="background:#f4f5f7;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Invoice Number:</strong> ${invoiceNo}</p>
          <p style="margin:4px 0;"><strong>Booking Reference:</strong> ${bookingNo}</p>
          ${totalDisplay ? `<p style="margin:4px 0;"><strong>Total Billed:</strong> ${totalDisplay}</p>` : ''}
          ${balanceDisplay ? `<p style="margin:4px 0;font-weight:700;color:#0f172a;"><strong>Balance Due:</strong> ${balanceDisplay}</p>` : ''}
        </div>
        <p>Payment can be settled in person, via bank transfer, or via Fonepay / QR.</p>
      `
      break
    }

    case 'receipt_document': {
      const bookingNo = String(data['booking_no'] ?? '')
      const receiptNo = String(data['receipt_no'] ?? '')
      const amountDisplay = String(data['amount_display'] ?? '')
      const paymentMethod = String(data['method'] ?? 'Payment')
      const balanceDisplay = data['balance_display'] ? String(data['balance_display']) : null

      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>Thank you! Your payment has been received and credited to your rental account.</p>
        <div style="background:#f4f5f7;padding:16px;border-radius:8px;margin:16px 0;">
          ${receiptNo ? `<p style="margin:4px 0;"><strong>Receipt Reference:</strong> ${receiptNo}</p>` : ''}
          <p style="margin:4px 0;"><strong>Booking Reference:</strong> ${bookingNo}</p>
          <p style="margin:4px 0;"><strong>Amount Received:</strong> ${amountDisplay} (${paymentMethod})</p>
          ${balanceDisplay ? `<p style="margin:4px 0;"><strong>Remaining Balance:</strong> ${balanceDisplay}</p>` : '<p style="margin:4px 0;color:#16a34a;font-weight:600;">Status: Fully Settled ✅</p>'}
        </div>
      `
      break
    }

    case 'rental_agreement': {
      const bookingNo = String(data['booking_no'] ?? '')
      const startDate = String(data['start_date'] ?? 'As scheduled')
      const endDate = String(data['end_date'] ?? 'As scheduled')
      const itemsCount = String(data['items_count'] ?? '')

      mainBody = `
        <p>Dear ${recipient_name},</p>
        <p>Here is your copy of the <strong>Equipment Rental Agreement & Custody Attestation</strong> for booking <strong>${bookingNo}</strong>.</p>
        <div style="background:#f4f5f7;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Booking Reference:</strong> ${bookingNo}</p>
          <p style="margin:4px 0;"><strong>Rental Period:</strong> ${startDate} → ${endDate}</p>
          ${itemsCount ? `<p style="margin:4px 0;"><strong>Verified Equipment:</strong> ${itemsCount} item(s)</p>` : ''}
        </div>
        <p>Please keep this document for your production records and inventory insurance tracking.</p>
      `
      break
    }

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
