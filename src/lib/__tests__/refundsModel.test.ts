import { describe, it, expect } from 'vitest'
import {
  executeOnlineRefund,
  reconcilePaymentIntents,
  canProcessRefunds,
  type OnlinePaymentIntent,
  type RefundExecutionRequest,
} from '../refundsModel'

describe('T7-07 Online Refunds and Intent Reconciliation', () => {
  const sampleIntent: OnlinePaymentIntent = {
    intentId: 'pi_123',
    clientId: 'cli_456',
    amountPaisa: 500000,
    provider: 'fonepay',
    providerRef: 'FP-TXN-999',
    status: 'paid',
    paidAtUtc: '2026-11-10T10:00:00Z',
  }

  it('restricts refund processing to Owner, Admin, Manager, and Accounts', () => {
    expect(canProcessRefunds('Owner')).toBe(true)
    expect(canProcessRefunds('Accounts')).toBe(true)
    expect(canProcessRefunds('Manager')).toBe(true)
    expect(canProcessRefunds('Warehouse')).toBe(false)
    expect(canProcessRefunds('Technician')).toBe(false)
  })

  it('processes refund to original wallet or store credit as an immutable reversal row', () => {
    const req: RefundExecutionRequest = {
      intentId: 'pi_123',
      amountPaisa: 500000,
      destination: 'store_credit',
      reason: 'Gear unavailable and client selected store credit',
      actorRole: 'Accounts',
      actorUserId: 'user-acc-01',
    }

    const res = executeOnlineRefund(sampleIntent, req)
    expect(res.success).toBe(true)
    expect(res.refund?.destination).toBe('store_credit')
    expect(res.refund?.reversalTxId).toContain('rev_FP-TXN-999')
  })

  it('flags unallocated paid intents older than 3 days in daily reconciliation', () => {
    const now = new Date('2026-11-18T12:00:00Z')
    const intents: OnlinePaymentIntent[] = [
      sampleIntent, // Paid Nov 10 (>3 days ago)
      {
        intentId: 'pi_fresh',
        clientId: 'cli_789',
        amountPaisa: 200000,
        provider: 'esewa',
        providerRef: 'ES-001',
        status: 'paid',
        paidAtUtc: '2026-11-17T10:00:00Z', // 1 day ago
      },
    ]

    const audit = reconcilePaymentIntents(intents, now)
    expect(audit.totalPaidIntents).toBe(2)
    expect(audit.unallocatedIntentsCount).toBe(2)
    expect(audit.staleUnallocatedOverThreeDays.length).toBe(1)
    expect(audit.staleUnallocatedOverThreeDays[0]?.intentId).toBe('pi_123')
  })
})
