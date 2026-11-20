import { describe, it, expect } from 'vitest'
import {
  executeOnlineRefund, prepareRefund, reconcilePaymentIntents, canProcessRefunds,
  type OnlinePaymentIntent, type RefundExecutionRequest,
} from '../refundsModel'

describe('T7-07 non-executing refund planning and reconciliation', () => {
  const intent: OnlinePaymentIntent = {
    intentId: 'pi_123', clientId: 'cli_456', amountPaisa: 500000,
    provider: 'fonepay', providerRef: 'FP-TXN-999', status: 'paid',
    paidAtUtc: '2026-11-10T10:00:00Z',
  }
  const req: RefundExecutionRequest = {
    intentId: 'pi_123', amountPaisa: 500000,
    destination: 'store_credit', reason: 'Customer chose store credit',
    actorRole: 'Accounts', actorUserId: 'test-accountant',
  }

  it('restricts planning by role, without claiming this is backend authorization', () => {
    expect(canProcessRefunds('Owner')).toBe(true)
    expect(canProcessRefunds('Accounts')).toBe(true)
    expect(canProcessRefunds('Warehouse')).toBe(false)
    expect(canProcessRefunds('Technician')).toBe(false)
    expect(prepareRefund(intent, { ...req, actorRole: 'Warehouse' }).success).toBe(false)
  })

  it('prepares a pending plan but NEVER marks an unconfirmed provider refund completed', () => {
    const plan = prepareRefund(intent, req)
    expect(plan.success).toBe(true)
    expect(plan.plan?.destination).toBe('store_credit')
    expect(plan.plan?.status).toBe('pending_provider_confirmation')
    expect(plan.plan?.idempotencyKey).toBe('refund:pi_123')
    const executed = executeOnlineRefund(intent, req)
    expect(executed.success).toBe(false)
    expect(executed.error).toContain('BACKEND_NOT_CONNECTED')
  })

  it('rejects mismatched, allocated, duplicate and invalid amount requests', () => {
    expect(prepareRefund(intent, { ...req, intentId: 'other' }).success).toBe(false)
    expect(prepareRefund({ ...intent, status: 'allocated' }, req).success).toBe(false)
    expect(prepareRefund({ ...intent, status: 'refunded' }, req).success).toBe(false)
    expect(prepareRefund(intent, { ...req, amountPaisa: 500001 }).success).toBe(false)
    expect(prepareRefund(intent, { ...req, amountPaisa: 500.1 }).success).toBe(false)
    expect(prepareRefund(intent, { ...req, reason: '' }).success).toBe(false)
  })

  it('flags stale payments for human review using Nepal Saturday weekend, with holiday uncertainty explicit', () => {
    const now = new Date('2026-11-18T12:00:00Z')
    const recent: OnlinePaymentIntent = {
      ...intent, intentId: 'fresh', paidAtUtc: '2026-11-17T10:00:00Z',
    }
    const audit = reconcilePaymentIntents([intent, recent], now)
    expect(audit.totalPaidIntents).toBe(2)
    expect(audit.unallocatedIntentsCount).toBe(2)
    expect(audit.staleUnallocatedOverThreeDays).toHaveLength(1)
    expect(audit.holidayCalendarVerified).toBe(false)
  })
})
