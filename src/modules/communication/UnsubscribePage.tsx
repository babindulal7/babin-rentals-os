import React, { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { unsubscribeClient } from '../../actions/marketing/offerCampaigns'
import Icon from '../../components/ui/Icon'

export function UnsubscribePage(): React.ReactElement {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [clientCode, setClientCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false)
    }
    function handleOffline() {
      setIsOffline(true)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (isOffline) {
      setLoading(false)
      return
    }

    if (!token || !token.trim()) {
      setLoading(false)
      setError('Missing unsubscribe token. Please use the link provided at the bottom of your marketing email.')
      return
    }

    let active = true
    unsubscribeClient(token.trim())
      .then((res) => {
        if (!active) return
        setLoading(false)
        if (res.success) {
          setSuccess(true)
          setClientCode(res.clientCode ?? null)
        } else {
          setError(res.error || 'The unsubscribe link is invalid or has expired.')
        }
      })
      .catch((err) => {
        if (!active) return
        setLoading(false)
        setError(err instanceof Error ? err.message : 'Network error while processing unsubscribe.')
      })

    return () => {
      active = false
    }
  }, [token, isOffline])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Babin Rentals</h1>
        <p className="mt-1 text-sm text-slate-500">Marketing & Promotional Email Preferences</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-xl sm:px-10">
          {/* State 1: Offline */}
          {isOffline && (
            <div className="text-center py-6" role="alert" aria-live="polite">
              <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icon name="wifi_off" size={24} />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">You are offline</h2>
              <p className="mt-2 text-sm text-slate-600">
                An active internet connection is required to update your marketing preferences. Please reconnect and refresh the page.
              </p>
            </div>
          )}

          {/* State 2: Loading */}
          {!isOffline && loading && (
            <div className="text-center py-8" role="status" aria-live="polite">
              <Icon name="loader" size={40} className="text-sky-600 animate-spin mx-auto mb-4" />
              <h2 className="text-base font-semibold text-slate-900">Updating preferences...</h2>
              <p className="mt-1 text-xs text-slate-500">Unsubscribing you from marketing communications</p>
            </div>
          )}

          {/* State 3: Error */}
          {!isOffline && !loading && error && (
            <div className="text-center py-6" role="alert">
              <div className="w-12 h-12 bg-rose-100 text-rose-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icon name="alert_circle" size={24} />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Unsubscribe Unsuccessful</h2>
              <p className="mt-2 text-sm text-slate-600">{error}</p>
              <div className="mt-6">
                <Link
                  to="/"
                  className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  Return to Home
                </Link>
              </div>
            </div>
          )}

          {/* State 4: Success */}
          {!isOffline && !loading && success && (
            <div className="text-center py-6" role="region" aria-label="Unsubscribe confirmation">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icon name="check_circle" size={24} />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Unsubscribed Successfully</h2>
              <p className="mt-2 text-sm text-slate-600">
                You have been unsubscribed from all marketing, promotional, and seasonal discount emails from Babin Rentals.
              </p>
              {clientCode && (
                <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 font-mono">
                  Client ID: {clientCode} · Marketing consent: Opted out
                </div>
              )}
              <div className="mt-4 p-3 bg-blue-50/70 border border-blue-100 rounded-lg text-left">
                <div className="flex gap-2">
                  <Icon name="mail_x" size={20} className="text-blue-700 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-900 leading-relaxed">
                    <strong>Note:</strong> You will continue to receive essential, transactional notices regarding your active gear reservations, security deposits, and handover receipts.
                  </p>
                </div>
              </div>
              <div className="mt-6">
                <a
                  href="https://book.babinrentals.com"
                  className="inline-flex items-center justify-center min-h-[44px] w-full px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
                >
                  Browse Rental Catalog
                </a>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Babin Rentals OS · New Baneshwor, Kathmandu · +977-1-4780000
        </p>
      </div>
    </div>
  )
}
