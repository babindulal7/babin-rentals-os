import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

/* Self-hosted, same families the ops app already ships — no CDN font request
   blocking first paint on a page whose whole job is first impressions. */
import '@fontsource/outfit/latin-400.css'
import '@fontsource/outfit/latin-500.css'
import '@fontsource/outfit/latin-600.css'
import '@fontsource/outfit/latin-700.css'
import '@fontsource/outfit/latin-800.css'

import './marketing.css'
import MarketingPage from './MarketingPage'

if (typeof window !== 'undefined' && window.location.hash.includes('my-bookings')) {
  window.location.replace('/booking#/my-bookings')
}

const el = document.getElementById('marketing-root')
if (!el) throw new Error('marketing-root missing from marketing.html')

createRoot(el).render(
  <StrictMode>
    <MarketingPage />
  </StrictMode>,
)
