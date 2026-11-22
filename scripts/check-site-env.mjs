#!/usr/bin/env node
/**
 * Fail closed on Cloudflare hosted builds before Vite embeds public environment values.
 * Local builds are for artifact inspection only and are NOT deployment acceptance.
 */
const site = process.argv[2]
if (site !== 'staff' && site !== 'client') {
  console.error('Usage: node scripts/check-site-env.mjs staff|client')
  process.exit(1)
}

if (process.env.CF_PAGES === '1') {
  const url = process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (process.env.VITE_DATA_SOURCE === 'mock' || process.env.VITE_MOCK_SEEDED === 'true' ||
      process.env.VITE_DEV_AUTH_BYPASS === 'true') {
    throw new Error('Hosted builds must never enable mock data or development auth bypass.')
  }
  if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) || !key) {
    throw new Error('Cloudflare Pages requires a valid HTTPS Supabase project URL and publishable/anon key.')
  }
  if (/sb_secret_|service_role/i.test(key)) {
    throw new Error('A privileged Supabase key must never be put in VITE_ variables.')
  }
  if (key.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8'))
      if (payload.role !== 'anon') throw new Error('not an anon JWT')
    } catch {
      throw new Error('Hosted builds require a valid Supabase anon JWT or publishable key.')
    }
  } else if (!key.startsWith('sb_publishable_')) {
    throw new Error('Hosted builds require a Supabase publishable key or legacy anon JWT.')
  }
  console.log(`[${site}] Cloudflare environment preflight passed; values are not printed.`)
} else {
  console.log(`[${site}] Local artifact build only. Cloudflare credential and Access checks remain unverified.`)
}
