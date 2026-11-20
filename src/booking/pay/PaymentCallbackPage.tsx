import { useEffect, useState } from 'react'
import { verifyOnlinePayment, type PaymentProvider } from './payApi'

type CallbackStatus =
  | { kind: 'checking' }
  | { kind: 'allocated'; paymentNo: string | null }
  | { kind: 'unallocated' }
  | { kind: 'failed'; reason: string }

function getReturnPayload(search: string) {
  const params = new URLSearchParams(search)
  const data = params.get('data') || ''
  let encodedIntent = ''
  if (data) {
    try {
      const parsed = JSON.parse(atob(data)) as { transaction_uuid?: unknown }
      if (typeof parsed.transaction_uuid === 'string') {
        encodedIntent = parsed.transaction_uuid
      }
    } catch {
      // Provider data must be independently verified; malformed content is never proof.
    }
  }

  const providerText = params.get('provider')
  const provider = providerText === 'fonepay' || providerText === 'esewa' || providerText === 'khalti'
    ? providerText as PaymentProvider : undefined

  return {
    intentId: params.get('intent_id') || params.get('PRN')
      || params.get('purchase_order_id') || encodedIntent,
    provider,
    providerRef: params.get('UID') || params.get('ref')
      || params.get('transaction_id') || '',
    bid: params.get('BID') || '',
    uid: params.get('UID') || '',
    pidx: params.get('pidx') || '',
    data,
    responseCode: params.get('RC') || params.get('responseCode') || '',
    returnFailed: ['failed', 'cancelled', 'canceled'].includes(
      (params.get('status') || '').toLowerCase()
    ),
  }
}

/**
 * Public return page. A browser URL and provider status text NEVER constitute
 * a payment receipt. The verified Edge response controls every money state.
 */
export function PaymentCallbackPage() {
  const [result, setResult] = useState<CallbackStatus>({ kind: 'checking' })

  useEffect(() => {
    const payload = getReturnPayload(window.location.search)
    let active = true
    if (payload.returnFailed) {
      setResult({ kind: 'failed', reason: 'The payment provider returned a cancelled or failed checkout.' })
      return
    }
    if (!payload.intentId) {
      setResult({ kind: 'failed', reason: 'Missing payment reference. No payment has been confirmed.' })
      return
    }

    void verifyOnlinePayment({
      intentId: payload.intentId,
      provider: payload.provider,
      providerRef: payload.providerRef,
      bid: payload.bid,
      uid: payload.uid,
      pidx: payload.pidx,
      data: payload.data,
      responseCode: payload.responseCode,
    }).then((reply) => {
      if (!active) return
      if (reply.status === 'allocated' && reply.payment_id) {
        setResult({ kind: 'allocated', paymentNo: reply.payment_no || null })
      } else if (reply.status === 'paid') {
        // This can happen when payment precedes staff confirmation.
        setResult({ kind: 'unallocated' })
      } else {
        setResult({ kind: 'failed', reason: 'Payment has not been confirmed in the booking ledger.' })
      }
    }).catch(() => {
      if (!active) return
      setResult({
        kind: 'failed',
        reason: 'Verification is currently unavailable. Do not pay again until Babin Rentals checks the transaction.',
      })
    })

    return () => { active = false }
  }, [])

  const title = result.kind === 'checking' ? 'Checking payment securely…'
    : result.kind === 'allocated' ? 'Payment verified'
    : result.kind === 'unallocated' ? 'Payment verified — allocation pending'
    : 'Payment not confirmed'

  const summary = result.kind === 'checking'
    ? 'Contacting the payment verification service. A redirect is not a receipt.'
    : result.kind === 'allocated'
      ? 'The payment verification service confirmed a booking ledger allocation.'
      : result.kind === 'unallocated'
        ? 'The provider transaction was verified, but the booking payment is not yet allocated. Our team will reconcile it.'
        : result.reason

  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--bg, #0b1220)',
      color: 'var(--text, #f8fafc)',
      padding: 'clamp(24px, 8vw, 80px) 16px',
      fontFamily: 'Outfit, system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: 28, border: '1px solid #475569', borderRadius: 18 }}>
        <h1 style={{ fontSize: 'clamp(22px, 4vw, 32px)' }}>{title}</h1>
        <p role="status" aria-live="polite" style={{ lineHeight: 1.6 }}>{summary}</p>
        {result.kind === 'allocated' && result.paymentNo && (
          <p>Payment receipt: <strong>{result.paymentNo}</strong></p>
        )}
        <p style={{ opacity: 0.8, fontSize: 14 }}>
          Never use this page alone as payment evidence. The verified payment record is authoritative.
        </p>
        <a href="/" style={{ color: '#93c5fd', display: 'inline-block', marginTop: 16 }}>
          Return to Babin Rentals
        </a>
      </div>
    </main>
  )
}

export default PaymentCallbackPage
