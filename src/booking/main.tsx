import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

/* Self-hosted fonts matching ops app standards */
import '@fontsource/outfit/latin-400.css'
import '@fontsource/outfit/latin-500.css'
import '@fontsource/outfit/latin-600.css'
import '@fontsource/outfit/latin-700.css'
import '@fontsource/outfit/latin-800.css'

import './booking.css'
import BookingApp from './App'
import { PaymentCallbackPage } from './pay/PaymentCallbackPage'

const el = document.getElementById('booking-root')
if (!el) throw new Error('booking-root missing from booking.html')

createRoot(el).render(
  <StrictMode>
    {window.location.pathname === '/pay/callback' ? <PaymentCallbackPage /> : <BookingApp />}
  </StrictMode>,
)
