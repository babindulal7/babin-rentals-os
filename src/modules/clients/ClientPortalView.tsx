import { useState, useEffect } from 'react'
import {
  authenticateClientSession,
  getClientPortalBookings,
  getClientPortalInvoices,
  type ClientPortalProfile,
  type ClientPortalBooking,
  type ClientPortalInvoice,
} from '../../lib/clientPortalEngine'
import { formatMoney } from '../../lib/money'

export default function ClientPortalView({
  clientEmail,
  isEmailVerified = true,
}: {
  clientEmail?: string
  isEmailVerified?: boolean
}) {
  const [profile, setProfile] = useState<ClientPortalProfile | null>(null)
  const [bookings, setBookings] = useState<ClientPortalBooking[]>([])
  const [invoices, setInvoices] = useState<ClientPortalInvoice[]>([])
  const [activeTab, setActiveTab] = useState<'bookings' | 'invoices'>('bookings')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const emailToUse = clientEmail || 'aarav@cinema.test'
      const authRes = await authenticateClientSession(emailToUse, isEmailVerified)

      if (authRes.error || !authRes.client) {
        setError(authRes.error || 'Authentication failed.')
        setLoading(false)
        return
      }

      setProfile(authRes.client)

      const [bks, invs] = await Promise.all([
        getClientPortalBookings(authRes.client.id),
        getClientPortalInvoices(authRes.client.id),
      ])

      setBookings(bks)
      setInvoices(invs)
      setLoading(false)
    }

    load()
  }, [clientEmail, isEmailVerified])

  if (loading) {
    return (
      <div data-testid="client-portal-loading" className="p-8 text-center text-ash font-mono text-sm">
        Authenticating client session &amp; loading portal records…
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div data-testid="client-portal-auth-error" className="p-8 max-w-xl mx-auto my-12 rounded-2xl border border-red-500/30 bg-red-950/20 text-red-200">
        <h3 className="font-bold text-lg mb-2">Access Denied</h3>
        <p className="text-sm font-mono">{error}</p>
      </div>
    )
  }

  return (
    <div data-testid="client-portal-container" className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Client Identity Header */}
      <header className="rounded-3xl border border-slate-line bg-ink-2/90 backdrop-blur-xl p-6 sm:p-8 mb-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-gold/10 border border-gold/30 text-gold font-mono text-xs font-semibold">
                Client Portal · {profile.clientCode}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400 text-xs font-mono">
                Verified Session
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-bone mt-2">
              {profile.name}
            </h1>
            <p className="text-sm text-ash mt-1">
              {profile.company || profile.email} · Phone: {profile.phone}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-2 rounded-2xl border border-slate-line bg-ink-3">
              <span className="block text-[11px] font-mono text-ash/70">Membership Plan</span>
              <span className="font-bold text-sm text-gold">{profile.membershipTier}</span>
            </div>
            <div className="px-4 py-2 rounded-2xl border border-slate-line bg-ink-3">
              <span className="block text-[11px] font-mono text-ash/70">Server Discount</span>
              <span data-testid="client-discount-badge" className="font-bold text-sm text-emerald-400 font-mono">
                {profile.serverDiscountPercent}% Off
              </span>
            </div>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-2 mt-6 pt-6 border-t border-slate-line/60">
          <button
            type="button"
            data-testid="tab-my-bookings"
            onClick={() => setActiveTab('bookings')}
            className={`px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
              activeTab === 'bookings'
                ? 'bg-gold text-ink shadow-md'
                : 'bg-ink-3 text-ash hover:text-bone hover:bg-slate-line/60'
            }`}
          >
            My Bookings ({bookings.length})
          </button>
          <button
            type="button"
            data-testid="tab-own-invoices"
            onClick={() => setActiveTab('invoices')}
            className={`px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
              activeTab === 'invoices'
                ? 'bg-gold text-ink shadow-md'
                : 'bg-ink-3 text-ash hover:text-bone hover:bg-slate-line/60'
            }`}
          >
            Invoices &amp; Receipts ({invoices.length})
          </button>
        </div>
      </header>

      {/* Bookings View */}
      {activeTab === 'bookings' && (
        <section data-testid="portal-bookings-section">
          {bookings.length === 0 ? (
            <div className="rounded-2xl border border-slate-line bg-ink-2 p-8 text-center text-ash text-sm">
              No active or historical bookings found.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {bookings.map((b) => (
                <div
                  key={b.id}
                  data-testid={`client-booking-card-${b.bookingNo}`}
                  className="rounded-2xl border border-slate-line bg-ink-2/80 p-6 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-xs font-bold text-gold">{b.bookingNo}</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-[11px] font-mono text-ash">
                        {b.stage}
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-bone">{b.project}</h3>
                    <div className="mt-4 space-y-1 text-xs font-mono text-ash/80">
                      <div>Pickup: {b.pickupAtAd}</div>
                      <div>Return: {b.returnAtAd}</div>
                      <div>Items: {b.itemCount} Units</div>
                    </div>
                  </div>

                  <ul className="mt-6 pt-4 border-t border-slate-line/50 space-y-1 text-xs text-ash">
                    {b.items.map((it, idx) => (
                      <li key={idx} className="flex justify-between">
                        <span>{it.name} (x{it.quantity})</span>
                        <span className="font-mono text-bone">Rs {formatMoney(it.dailyRatePaisa)}/day</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Invoices View */}
      {activeTab === 'invoices' && (
        <section data-testid="portal-invoices-section">
          {invoices.length === 0 ? (
            <div className="rounded-2xl border border-slate-line bg-ink-2 p-8 text-center text-ash text-sm">
              No non-void invoices found for this account.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-line bg-ink-2 overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-ink-3 text-ash/80 border-b border-slate-line">
                  <tr>
                    <th className="p-4">Invoice No</th>
                    <th className="p-4">Booking</th>
                    <th className="p-4">Due Date</th>
                    <th className="p-4 text-right">Subtotal</th>
                    <th className="p-4 text-right">Discount</th>
                    <th className="p-4 text-right">VAT (13%)</th>
                    <th className="p-4 text-right">Total (NPR)</th>
                    <th className="p-4 text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-line/50 text-bone">
                  {invoices.map((inv) => (
                    <tr key={inv.id} data-testid={`client-invoice-row-${inv.invoiceNo}`}>
                      <td className="p-4 font-bold text-gold">{inv.invoiceNo}</td>
                      <td className="p-4 text-ash">{inv.bookingNo}</td>
                      <td className="p-4 text-ash">{inv.dueDateAd}</td>
                      <td className="p-4 text-right">Rs {formatMoney(inv.subtotal)}</td>
                      <td className="p-4 text-right text-emerald-400">
                        -{inv.discountPercent}% (Rs {formatMoney(inv.discountAmount)})
                      </td>
                      <td className="p-4 text-right">Rs {formatMoney(inv.vatAmount)}</td>
                      <td className="p-4 text-right font-bold">Rs {formatMoney(inv.totalAmount)}</td>
                      <td className="p-4 text-right font-bold text-amber-400">
                        Rs {formatMoney(inv.outstandingAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
