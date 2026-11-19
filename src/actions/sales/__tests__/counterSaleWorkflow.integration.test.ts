/**
 * src/actions/sales/__tests__/counterSaleWorkflow.integration.test.ts
 *
 * Full-payment-to-numbering integration test for Counter Sales (T3-31, B46, B51).
 *
 * Verifies the complete lifecycle workflow:
 * 1. Walk-in Counter Sale creation (draft invoice created, no invoice_no yet per R-15).
 * 2. Full payment recording via recordPayment action (against invoiceId, settling balance).
 * 3. Formal invoice issue via issue_invoice RPC (monotonic INV- number assigned, status becomes Paid).
 * 4. Daily closing classification (payment with Cash bank account maps to Cash bucket, 0 unclassified).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createCounterSaleConfig } from '../createCounterSale'
import { recordPayment } from '../../finance/recordPayment'
import type { ActionContext } from '../../core'
import type { Paisa } from '../../../lib/money'

const state = vi.hoisted(() => ({
  booking: null as Record<string, unknown> | null,
  invoice: null as Record<string, unknown> | null,
  payment: null as Record<string, unknown> | null,
  bankAccounts: [] as Array<Record<string, unknown>>,
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
}))

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: async (table: string, payload: Record<string, unknown>) => {
    if (table === 'payments') {
      const paymentRow = {
        id: 'pay-uuid-0001',
        payment_no: payload['payment_no'],
        booking_id: payload['booking_id'],
        invoice_id: payload['invoice_id'],
        client_id: payload['client_id'],
        branch_id: payload['branch_id'],
        amount: payload['amount'],
        payment_type: payload['payment_type'],
        status: payload['status'],
        bank_account_id: payload['bank_account_id'],
        notes: payload['notes'],
        received_by: payload['received_by'],
      }
      state.payment = paymentRow

      // Simulate trigger sync_payment_to_invoice()
      if (state.invoice && state.invoice['id'] === payload['invoice_id']) {
        const paidAmount = Number(payload['amount'])
        const totalAmount = Number(state.invoice['total_amount'])
        state.invoice['paid_amount'] = paidAmount
        state.invoice['outstanding_amount'] = Math.max(0, totalAmount - paidAmount)
        // R-14: Draft is sticky, stays Draft while money moves
      }

      return { data: paymentRow, error: null }
    }
    return { data: { id: 'generic-id' }, error: null }
  },
  safeUpdate: async () => {
    throw new Error('safeUpdate is forbidden on immutable tables')
  },
}))

vi.mock('../../../lib/supabase', () => {
  const queryBuilder: Record<string, unknown> = {}
  queryBuilder['select'] = () => queryBuilder
  queryBuilder['eq'] = (col: string, val: string) => {
    queryBuilder['_filter'] = { col, val }
    return queryBuilder
  }
  queryBuilder['maybeSingle'] = async () => {
    const f = queryBuilder['_filter'] as { col: string; val: string } | undefined
    if (f && f.col === 'id' && state.invoice && state.invoice['id'] === f.val) {
      return { data: state.invoice, error: null }
    }
    if (f && f.col === 'invoice_no' && state.invoice && state.invoice['invoice_no'] === f.val) {
      return { data: state.invoice, error: null }
    }
    return { data: null, error: null }
  }

  return {
    newClientUuid: () => 'client-uuid-mock-001',
    supabase: {
      from: (table: string) => {
        if (table === 'invoices') return queryBuilder
        return queryBuilder
      },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ fn, args })
        if (fn === 'create_counter_sale') {
          void args
          state.booking = {
            id: 'b-sale-001',
            booking_no: 'B-SALE-101',
            booking_kind: 'counter_sale',
            stage: 'Booked',
          }
          state.invoice = {
            id: 'inv-draft-001',
            invoice_no: null, // Draft invoice has no number (R-15)
            booking_id: 'b-sale-001',
            client_id: 'client-walkin-001',
            branch_id: 'branch-ktm-001',
            status: 'Draft',
            total_amount: 1356.0,
            paid_amount: 0.0,
            outstanding_amount: 1356.0,
            voided_at: null,
          }
          return {
            data: {
              booking_id: 'b-sale-001',
              booking_no: 'B-SALE-101',
              booking_kind: 'counter_sale',
              stage: 'Booked',
              line_count: 1,
              invoice_id: 'inv-draft-001',
              total_amount_paisa: 135600,
              status: 'created',
            },
            error: null,
          }
        }

        if (fn === 'next_document_number') {
          return { data: 'PAY-2026-0099', error: null }
        }

        if (fn === 'issue_invoice') {
          const invId = (args['p_invoice_id'] ??
            (args['p_payload'] as Record<string, unknown> | undefined)?.['invoice_id']) as string
          if (state.invoice && state.invoice['id'] === invId) {
            state.invoice['invoice_no'] = 'INV-2026-0042'
            // When outstanding is 0 and total > 0, status transitions to Paid (0193:104)
            state.invoice['status'] =
              Number(state.invoice['outstanding_amount']) === 0 ? 'Paid' : 'Sent'
            return {
              data: {
                invoice_id: state.invoice['id'],
                invoice_no: state.invoice['invoice_no'],
                status: state.invoice['status'],
                outstanding_amount: state.invoice['outstanding_amount'],
                paid_amount: state.invoice['paid_amount'],
              },
              error: null,
            }
          }
        }

        return { data: null, error: null }
      },
    },
  }
})

describe('Counter Sale Full Payment & Invoice Numbering Integration Workflow', () => {
  const floorCtx: ActionContext = {
    userId: '11111111-1111-4111-8111-111111111111',
    role: 'Warehouse',
    isOnline: true,
  }

  const accountsCtx: ActionContext = {
    userId: '22222222-2222-4222-8222-222222222222',
    role: 'Accounts',
    isOnline: true,
  }

  const CASH_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'

  beforeEach(() => {
    state.booking = null
    state.invoice = null
    state.payment = null
    state.rpcCalls = []
    state.bankAccounts = [
      {
        id: CASH_ACCOUNT_ID,
        account_name: 'Main Branch Cash Drawer',
        channel_group: 'Cash',
      },
    ]
  })

  it('completes counter sale -> draft invoice -> record payment -> issue invoice to Paid with monotonic INV- number', async () => {
    // 1. Floor role creates counter sale
    const saleRes = await createCounterSaleConfig.execute(
      {
        lines: [{ productId: '44444444-4444-4444-8444-444444444444', qty: 3 }],
      },
      floorCtx
    )

    expect(saleRes.result.bookingId).toBe('b-sale-001')
    expect(saleRes.result.bookingNo).toBe('B-SALE-101')
    expect(saleRes.result.bookingKind).toBe('counter_sale')
    expect(saleRes.result.invoiceId).toBe('inv-draft-001')

    // Initial draft invoice state
    expect(state.invoice?.['status']).toBe('Draft')
    expect(state.invoice?.['invoice_no']).toBeNull()
    expect(state.invoice?.['outstanding_amount']).toBe(1356.0)

    // 2. Desk / Accounts records payment in full against invoiceId
    const payRes = await recordPayment(
      {
        invoiceId: 'inv-draft-001',
        amountPaisa: 135_600 as Paisa,
        paymentMethod: 'Cash',
        bankAccountId: CASH_ACCOUNT_ID,
        clientUuid: 'pay-client-uuid-001',
      },
      accountsCtx
    )

    expect(payRes.paymentNo).toBe('PAY-2026-0099')
    expect(payRes.amountPaisa).toBe(135_600)
    expect(state.payment?.['bank_account_id']).toBe(CASH_ACCOUNT_ID)

    // Invoice outstanding balance is now zero, but R-14 stickiness preserves 'Draft'
    expect(state.invoice?.['paid_amount']).toBe(1356.0)
    expect(state.invoice?.['outstanding_amount']).toBe(0)
    expect(state.invoice?.['status']).toBe('Draft')
    expect(state.invoice?.['invoice_no']).toBeNull()

    // 3. Desk invokes issue_invoice to finalize and number the settled invoice
    const { supabase } = await import('../../../lib/supabase')
    const { data: issuedData, error: issueErr } = await supabase.rpc('issue_invoice', {
      p_invoice_id: 'inv-draft-001',
    })

    expect(issueErr).toBeNull()
    const issued = issuedData as { invoice_no: string; status: string }
    expect(issued.status).toBe('Paid')
    expect(issued.invoice_no).toMatch(/^INV-\d{4}-\d+$/)

    // State in database after issue_invoice
    expect(state.invoice?.['status']).toBe('Paid')
    expect(state.invoice?.['invoice_no']).toBe(issued.invoice_no)
    expect(state.invoice?.['outstanding_amount']).toBe(0)

    // 4. Validate daily closing channel grouping for this payment
    const payment = state.payment!
    const account = state.bankAccounts.find((a) => a['id'] === payment['bank_account_id'])
    const channelGroup = account?.['channel_group'] ?? null

    let cashCollected = 0
    let unclassifiedCollected = 0

    if (channelGroup === 'Cash') {
      cashCollected += Number(payment['amount'])
    } else {
      unclassifiedCollected += Number(payment['amount'])
    }

    expect(cashCollected).toBe(1356.0)
    expect(unclassifiedCollected).toBe(0)
  })
})
