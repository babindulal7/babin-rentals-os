import { describe, expect, it } from 'vitest'
import { renderEmailHtml } from '../templates'
import { buildWhatsAppDraftMessage } from '../../queries/clientMessages'

describe('Return acknowledgement in damage notices', () => {
  it('includes the recorded refusal and escapes names and reasons in HTML', () => {
    const html = renderEmailHtml({ template_id: 'damage_notice', recipient_email: 'crew@example.com', recipient_name: 'Film Crew', subject: 'Condition notice',
      data: { booking_no: 'BK-ACK', returned_by: '<script>Courier</script>', signature_refusal_reason: '<img src=x onerror=alert(1)>' } })
    expect(html).toContain('&lt;script&gt;Courier&lt;/script&gt;')
    expect(html).toContain('Refused to sign: &lt;img')
    expect(html).not.toContain('<script>Courier')
  })
  it('includes the persisted acknowledgement in the WhatsApp fallback without adding amounts', () => {
    const text = buildWhatsAppDraftMessage({ id: 'event', clientUuid: 'key', bookingId: 'booking', bookingNo: 'BK-ACK', eventType: 'damage_notice', recipientName: 'Film Crew', recipientPhone: null, dueAt: '', status: 'draft_ready',
      payload: { returned_by: 'Courier', signature_refusal_reason: 'Declined after review', amount: 999999 } })
    expect(text).toContain('Returned by Courier')
    expect(text).toContain('Refused to sign: Declined after review')
    expect(text).not.toContain('999999')
  })
})
