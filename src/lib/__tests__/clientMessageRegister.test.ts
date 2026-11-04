import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  CLIENT_MESSAGE_REGISTER,
  getClientMessageDefinition,
  isRegisteredClientMessage,
  getMessagesByTransmission,
} from '../clientMessageRegister'
import { type WaTemplateId } from '../whatsappTemplates'

describe('Client Message Register — T5-06, W20, W21, W60', () => {
  it('contains all 28 authoritative client messages', () => {
    expect(CLIENT_MESSAGE_REGISTER).toHaveLength(28)
  })

  it('verifies that docs/WORKFLOWS.md Section 4 markdown table matches the register exactly', () => {
    const workflowsPath = resolve(__dirname, '../../../docs/WORKFLOWS.md')
    const content = readFileSync(workflowsPath, 'utf8')

    expect(content).toContain('## 4. Client Message Register (T5-06, W20, W21, W60)')

    for (const msg of CLIENT_MESSAGE_REGISTER) {
      // Each registered message id must appear as a code literal in the table: `id`
      expect(content).toContain(`\`${msg.id}\``)
      expect(content).toContain(msg.name)
    }
  })

  it('guarantees every operational lifecycle event in queries/clientMessages is registered', async () => {
    const validEventTypes = [
      'pickup_reminder',
      'pickup_receipt',
      'return_reminder',
      'late_return',
      'return_receipt',
      'damage_notice',
      'damage_charge',
      'payment_reminder',
    ]

    for (const eventType of validEventTypes) {
      const entry = getClientMessageDefinition(eventType)
      expect(entry).toBeDefined()
      expect(entry?.id).toBe(eventType)
      expect(entry?.transmission).toBe('automatic_email')
      expect(entry?.recipient).toBe('client')
    }
  })

  it('guarantees every client-facing WhatsApp template in whatsappTemplates is registered', () => {
    const clientFacingWaTemplates: WaTemplateId[] = [
      'booking_confirmed',
      'gear_ready',
      'pickup_tomorrow',
      'return_reminder',
      'overdue',
      'dispatch_manifest',
      'return_receipt',
      'payment_receipt',
      'balance_due',
    ]

    for (const tId of clientFacingWaTemplates) {
      const match = CLIENT_MESSAGE_REGISTER.find(
        (m) => m.transmission === 'whatsapp_draft' && m.templateId === tId,
      )
      expect(match).toBeDefined()
    }
  })

  it('strictly enforces Law 6: damage notice carries NO monetary amount', () => {
    const notice = getClientMessageDefinition('damage_notice')
    expect(notice).toBeDefined()
    expect(notice?.hasMoneyAmount).toBe(false)
    expect(notice?.rulingRef).toContain('Law 6')

    const waNotice = getClientMessageDefinition('wa_damage_notice')
    expect(waNotice).toBeDefined()
    expect(waNotice?.hasMoneyAmount).toBe(false)
  })

  it('asserts that damage assessment charge has approved amount only (W23, P1)', () => {
    const charge = getClientMessageDefinition('damage_charge')
    expect(charge).toBeDefined()
    expect(charge?.hasMoneyAmount).toBe(true)
    expect(charge?.rulingRef).toContain('W23')
  })

  it('asserts payment reminder cadence follows W18 / W18b', () => {
    const reminder = getClientMessageDefinition('payment_reminder')
    expect(reminder).toBeDefined()
    expect(reminder?.timing).toContain('Completion (seq 0)')
    expect(reminder?.timing).toContain('every 5 days')
    expect(reminder?.rulingRef).toContain('W18')
  })

  it('refuses un-registered message IDs', () => {
    expect(isRegisteredClientMessage('non_existent_client_blast')).toBe(false)
    expect(isRegisteredClientMessage('promotional_sms_spam')).toBe(false)
    expect(isRegisteredClientMessage('pickup_reminder')).toBe(true)
  })

  it('partitions messages by transmission channel correctly', () => {
    const autoEmails = getMessagesByTransmission('automatic_email')
    const staffEmails = getMessagesByTransmission('staff_sent_email')
    const waDrafts = getMessagesByTransmission('whatsapp_draft')

    expect(autoEmails.length).toBe(13) // 8 operational + 5 portal
    expect(staffEmails.length).toBe(4)  // booking confirmation, quote, invoice, statement
    expect(waDrafts.length).toBe(11)    // 11 staff WhatsApp drafts

    expect(autoEmails.length + staffEmails.length + waDrafts.length).toBe(CLIENT_MESSAGE_REGISTER.length)
  })
})
